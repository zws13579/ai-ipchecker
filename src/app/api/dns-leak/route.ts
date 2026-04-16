import { NextRequest, NextResponse } from 'next/server';

// Edge Runtime配置
export const runtime = 'edge';
export const preferredRegion = 'auto';

// DNS泄露检测的核心原理：
// 1. 生成唯一的随机子域名（检测标识）
// 2. 客户端查询这个子域名
// 3. DNS查询递归传递到权威服务器
// 4. 权威服务器记录查询来源的DNS服务器IP
// 5. 比较查询来源IP与用户公网IP，判断泄露

// DNS服务器列表（用于检测）
const DNS_SERVERS = [
  { name: 'Google Public DNS', ip: '8.8.8.8', type: 'google' },
  { name: 'Cloudflare DNS', ip: '1.1.1.1', type: 'cloudflare' },
  { name: 'Quad9', ip: '9.9.9.9', type: 'quad9' },
  { name: 'OpenDNS', ip: '208.67.222.222', type: 'opendns' },
  { name: '阿里DNS', ip: '223.5.5.5', type: 'alidns' },
  { name: '腾讯DNS', ip: '119.29.29.29', type: 'tencent' },
  { name: '114DNS', ip: '1.12.12.12', type: '114dns' },
];

// 用于DNS泄露检测的权威域名（实际项目中需要自己的权威DNS服务器）
// 这里使用一个已知的DNS泄露检测服务作为示例
const LEAK_TEST_DOMAIN = 'dnsleaktest.com';

interface DNSQueryResult {
  dnsServer: string;
  dnsServerIP: string;
  resolvedIP: string | null;
  country: string;
  isp: string;
  success: boolean;
  error?: string;
}

interface LeakTestResponse {
  success: boolean;
  testId: string;
  timestamp: string;
  results: DNSQueryResult[];
  leakInfo: {
    isLeaking: boolean;
    leakLevel: 'none' | 'low' | 'medium' | 'high' | 'severe';
    leakedCountry: string | null;
    leakedISP: string | null;
    explanation: string;
  };
  recommendations: string[];
}

// 获取公网IP
async function getPublicIP(): Promise<string> {
  const endpoints = [
    'https://ifconfig.me/ip',
    'https://api.ipify.org',
    'https://icanhazip.com',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const ip = (await response.text()).trim();
        if (/^[\d.]+$/.test(ip)) {
          return ip;
        }
      }
    } catch {
      continue;
    }
  }
  return 'unknown';
}

// 获取IP的地理位置信息
async function getIPGeo(ip: string): Promise<{ country: string; isp: string }> {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=country,isp`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const data = await response.json();
      return {
        country: data.country || 'Unknown',
        isp: data.isp || 'Unknown'
      };
    }
  } catch {
    // ignore
  }
  return { country: 'Unknown', isp: 'Unknown' };
}

// 通过DNS over HTTPS查询域名
async function queryViaDoH(dohUrl: string, domain: string): Promise<string | null> {
  try {
    const url = `${dohUrl}?name=${domain}&type=A`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/dns-json'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json();
      if (data.Answer && data.Answer.length > 0) {
        return data.Answer[0].data;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientIP = searchParams.get('clientIP') || await getPublicIP();
    
    // 生成唯一的检测ID
    const testId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // DNS泄露检测API（使用DNSLeakTest的查询逻辑）
    // 注意：实际的DNS泄露检测需要权威DNS服务器记录查询来源
    // 这里使用一种模拟方式：通过DoH查询并分析返回的DNS服务器
    
    const results: DNSQueryResult[] = [];
    
    // 使用多个DoH服务器进行查询测试
    const dohServers = [
      { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query', ip: '1.1.1.1' },
      { name: 'Google', url: 'https://dns.google/resolve', ip: '8.8.8.8' },
      { name: 'Quad9', url: 'https://basic.quad9.net:5053/dns-query', ip: '9.9.9.9' },
      { name: '阿里DNS', url: 'https://dns.alidns.com/resolve', ip: '223.5.5.5' },
      { name: '腾讯DNS', url: 'https://doh.pub/resolve', ip: '119.29.29.29' },
    ];

    // 实际DNS泄露检测原理：
    // 当你使用VPN时，DNS查询应该通过VPN的DNS服务器
    // 如果DNS泄露，查询会通过本地ISP的DNS服务器
    // 通过分析返回的DNS服务器IP（从EDNS Client Subnet或查询来源判断）
    
    // 由于浏览器端无法直接获取DNS查询来源，我们使用以下方法：
    // 1. 查询一个特殊域名，该域名会返回DNS服务器的标识
    // 2. 通过多个DoH服务器查询，分析返回的IP归属地
    
    const testDomains = [
      `myip.${LEAK_TEST_DOMAIN}`,
      `ip.${LEAK_TEST_DOMAIN}`,
      `whoami.${LEAK_TEST_DOMAIN}`,
    ];

    for (const dohServer of dohServers) {
      const result: DNSQueryResult = {
        dnsServer: dohServer.name,
        dnsServerIP: dohServer.ip,
        resolvedIP: null,
        country: 'Unknown',
        isp: 'Unknown',
        success: false
      };

      // 尝试通过该DoH服务器查询
      for (const domain of testDomains) {
        const resolvedIP = await queryViaDoH(dohServer.url, domain);
        if (resolvedIP) {
          result.resolvedIP = resolvedIP;
          result.success = true;
          break;
        }
      }

      // 获取DoH服务器的地理位置
      const geo = await getIPGeo(dohServer.ip);
      result.country = geo.country;
      result.isp = geo.isp;

      results.push(result);
    }

    // 分析泄露情况
    // DNS泄露的核心判断：
    // 如果VPN正常工作，DNS查询应该通过VPN的DNS服务器
    // 如果有泄露，查询会通过本地ISP的DNS服务器
    
    // 获取客户端IP的地理位置
    const clientGeo = await getIPGeo(clientIP);
    
    // 统计不同DNS服务器返回的结果
    const uniqueResults = new Set(results.filter(r => r.success).map(r => `${r.country}-${r.isp}`));
    
    // 判断泄露等级
    let leakLevel: 'none' | 'low' | 'medium' | 'high' | 'severe' = 'none';
    const leakedCountry: string | null = null;
    const leakedISP: string | null = null;
    let explanation = '';

    if (uniqueResults.size > 3) {
      // 多个不同的DNS服务器响应，说明可能有泄露
      leakLevel = 'severe';
      explanation = '检测到大量不同的DNS服务器响应，您的DNS查询可能经过多个中间节点，存在严重的DNS泄露风险。';
    } else if (uniqueResults.size > 1) {
      // 有多个不同的DNS服务器响应
      leakLevel = 'medium';
      explanation = '检测到DNS查询经过多个不同的DNS服务器，可能存在DNS泄露。';
    } else if (results.filter(r => r.success).length > 0) {
      // 只有一个DNS服务器响应，说明正常
      leakLevel = 'none';
      explanation = 'DNS查询正常，您的DNS流量相对安全。';
    } else {
      // 无法获取DNS信息
      leakLevel = 'low';
      explanation = '无法获取DNS查询信息，请检查网络连接。';
    }

    // 如果泄露等级为none，检查是否与客户端IP一致
    if (leakLevel === 'none' && clientGeo.country !== 'Unknown') {
      const matchedResult = results.find(r => r.success && r.country === clientGeo.country);
      if (!matchedResult) {
        // DNS服务器所在国家与客户端不同，可能是VPN使用正常
        leakLevel = 'low';
        explanation = '您的DNS查询似乎通过远程DNS服务器进行，这是VPN正常工作的表现。';
      }
    }

    const response: LeakTestResponse = {
      success: true,
      testId,
      timestamp: new Date().toISOString(),
      results,
      leakInfo: {
        isLeaking: leakLevel !== 'none',
        leakLevel,
        leakedCountry,
        leakedISP,
        explanation
      },
      recommendations: [
        '使用可靠的VPN服务确保DNS查询安全',
        '启用DNS over HTTPS (DoH)加密DNS流量',
        '定期进行DNS泄露测试',
        '确保VPN的DNS泄露保护功能已启用'
      ]
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'DNS泄露检测失败'
    }, { status: 500 });
  }
}
