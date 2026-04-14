import { NextRequest, NextResponse } from 'next/server';

// Edge Runtime配置
export const runtime = 'edge';
export const preferredRegion = 'auto';

// IP地理位置信息接口
interface GeoInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  isp: string;
  asn: string;
  asName: string;
  timezone: string;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  hosting: boolean;
}

// 纯净度检测
interface CleanlinessResult {
  isClean: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  cleanlinessScore: number; // 0-100的精确分数
  reasons: string[];
  details: {
    isProxy: boolean;
    isVPN: boolean;
    isTor: boolean;
    isHosting: boolean;
    isDatacenter: boolean;
    isChineseIP: boolean;
  };
  chineseIPInfo?: {
    isChineseISP: boolean;
    isChineseASN: boolean;
    isChinaMainland: boolean;
    isHongKong: boolean;
    isTaiwan: boolean;
    isMacau: boolean;
    isSuspiciousChineseProxy: boolean;
  };
}

// 计算纯净度分数
function calculateCleanlinessScore(
  isProxy: boolean,
  isVPN: boolean,
  isTor: boolean,
  isHosting: boolean,
  isDatacenter: boolean,
  chineseIPInfo?: CleanlinessResult['chineseIPInfo']
): number {
  let score = 100;
  const deductions: { reason: string; amount: number }[] = [];

  // 代理服务器 - 严重风险
  if (isProxy) {
    deductions.push({ reason: '代理服务器', amount: 45 });
  }

  // Tor出口节点 - 严重风险
  if (isTor) {
    deductions.push({ reason: 'Tor出口节点', amount: 40 });
  }

  // VPN服务 - 中高风险
  if (isVPN) {
    deductions.push({ reason: 'VPN服务', amount: 30 });
  }

  // 托管服务 - 中等风险
  if (isHosting) {
    deductions.push({ reason: '托管服务', amount: 15 });
  }

  // 数据中心 - 轻微风险
  if (isDatacenter) {
    deductions.push({ reason: '数据中心', amount: 10 });
  }

  // 中国IP相关检测
  if (chineseIPInfo) {
    // 可疑中国出口节点（海外IP但使用中国运营商）- 中高风险
    if (chineseIPInfo.isSuspiciousChineseProxy) {
      const isNormalChinaIP = chineseIPInfo.isChinaMainland || 
                             chineseIPInfo.isHongKong || 
                             chineseIPInfo.isTaiwan || 
                             chineseIPInfo.isMacau;
      if (!isNormalChinaIP) {
        deductions.push({ reason: '可疑中国出口节点', amount: 35 });
      }
    }

    // 中国大陆IP - 轻微风险（仅地理位置因素）
    if (chineseIPInfo.isChinaMainland) {
      deductions.push({ reason: '中国大陆IP', amount: 5 });
    }

    // 港澳台IP - 轻微风险
    if (chineseIPInfo.isHongKong || chineseIPInfo.isTaiwan || chineseIPInfo.isMacau) {
      deductions.push({ reason: '港澳台IP', amount: 3 });
    }
  }

  // 计算最终分数（确保非负）
  deductions.forEach(d => {
    score = Math.max(0, score - d.amount);
  });

  // 如果有多个风险项，额外扣除一些（因为同时存在多种风险更可疑）
  if (deductions.length >= 3) {
    score = Math.max(0, score - 5);
  }
  if (deductions.length >= 4) {
    score = Math.max(0, score - 5);
  }

  return score;
}

// ASN查询结果接口
interface ASNInfo {
  asn: string;
  name: string;
  desc: string;
  holders: string[];
}

// 获取IP地理位置信息
async function getGeoInfo(ip: string): Promise<GeoInfo> {
  try {
    // 使用 ip-api.com (免费，无需API key，包含hosting和proxy检测)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,as,timezone,hosting,proxy`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    if (data.status === 'fail') {
      throw new Error(data.message);
    }

    // 解析ASN
    const asnMatch = data.as ? data.as.match(/AS(\d+)/) : null;
    const asn = asnMatch ? asnMatch[1] : '';
    const asName = data.as ? data.as.replace(/AS\d+\s*/, '').trim() : data.isp;

    return {
      ip,
      country: data.country || 'Unknown',
      countryCode: data.countryCode || 'XX',
      region: data.regionName || data.region || 'Unknown',
      city: data.city || 'Unknown',
      latitude: data.lat || 0,
      longitude: data.lon || 0,
      isp: data.isp || 'Unknown',
      asn,
      asName,
      timezone: data.timezone || 'UTC',
      proxy: data.proxy === true,
      vpn: false, // ip-api.com 不提供 VPN 检测
      tor: false, // ip-api.com 不提供 Tor 检测
      hosting: data.hosting === true
    };
  } catch (error) {
    console.error('Geo lookup failed:', error);
    // 返回默认数据
    return {
      ip,
      country: 'Unknown',
      countryCode: 'XX',
      region: 'Unknown',
      city: 'Unknown',
      latitude: 0,
      longitude: 0,
      isp: 'Unknown',
      asn: '',
      asName: 'Unknown',
      timezone: 'UTC',
      proxy: false,
      vpn: false,
      tor: false,
      hosting: false
    };
  }
}

// 检测IP是否被标记为中国IP（检测非中国地理位置但被标记为中国IP的情况）
async function checkChineseMarkedIP(ip: string, geoInfo: GeoInfo): Promise<CleanlinessResult['chineseIPInfo']> {
  const info: NonNullable<CleanlinessResult['chineseIPInfo']> = {
    isChineseISP: false,
    isChineseASN: false,
    isChinaMainland: false,
    isHongKong: false,
    isTaiwan: false,
    isMacau: false,
    isSuspiciousChineseProxy: false
  };

  // 1. 检测是否为大陆中国（正常情况）
  if (geoInfo.countryCode === 'CN') {
    info.isChinaMainland = true;
  }

  // 2. 检测是否为港澳台
  if (geoInfo.countryCode === 'HK') info.isHongKong = true;
  if (geoInfo.countryCode === 'TW') info.isTaiwan = true;
  if (geoInfo.countryCode === 'MO') info.isMacau = true;

  // 3. 检测是否为中国运营商（关键：即使是外国IP，如果ISP是中国运营商则可能是中国出口节点）
  const chineseISPs = [
    'china', 'cn', 'chinanet', 'unicom', 'telecom', 'cmcc', 'mobile',
    '移动', '联通', '电信', '铁通', '教育网', 'cernet', 'btb', 'cstnet',
    'tencent', 'aliyun', 'alibaba', 'baidu', 'huawei', 'wangsu',
    'tianyi', 'tel', 'cnc', 'jstnet', 'dx', 'broadband',
    '网关', '回国', '出口', '回国线路', 'cn2', 'gia'
  ];
  
  const ispLower = geoInfo.isp.toLowerCase();
  const isChineseISPDetected = chineseISPs.some(isp => ispLower.includes(isp));
  info.isChineseISP = isChineseISPDetected;

  // 4. 检测是否为中国ASN（即使是外国IP）
  if (geoInfo.asn) {
    try {
      // 使用 ipinfo.io 检查ASN信息
      const response = await fetch(`https://ipinfo.io/asn/${geoInfo.asn}`, { cache: 'no-store' });
      if (response.ok) {
        const asnData = await response.json();
        const asnName = (asnData.name || '').toLowerCase();
        const asnDesc = (asnData.desc || '').toLowerCase();
        const asnCountry = (asnData.country || '').toUpperCase();
        
        // 检查ASN是否与中国有关
        info.isChineseASN = chineseISPs.some(isp => 
          asnName.includes(isp) || asnDesc.includes(isp)
        ) || asnCountry === 'CN';
      }
    } catch {
      // 如果API失败，使用本地ASN范围判断
      const chineseASNPatterns = [
        /^4(138|139|800|806|807|808|809|810|811|812|813|814|815|816|817|818|819|820|821|822|823|836|837|838|839|840|841|842|843|844|845|846|847|848|849|850|851|852|853|854|855|856|992)$/,
        /^9(800|806|807|808|809|810|811|812|813|814|815|816|817|818|819|820|821|822|823|824|825|826|827|828|829|830|831|832|833|834|835|900|901|902|903|904|905|906|907|908|909|910|911|912|913|914|915|916|917|918|919|920|921|922|923|924|925|926|927|928|929|930|931|932|933|934|935|936|937|938|939|940|941|942|943|944|945|946|947|948|949)$/,
        /^1[3-9][0-9]{3}$/
      ];
      info.isChineseASN = chineseASNPatterns.some(pattern => pattern.test(geoInfo.asn));
    }
  }

  // 5. 核心检测：非中国地理位置但被检测为中国IP（VPN/代理出口）
  const isForeignIP = !info.isChinaMainland && !info.isHongKong && !info.isTaiwan && !info.isMacau;
  
  // 如果是外国IP，但ISP是中国运营商，说明是中国出口节点
  if (isForeignIP && isChineseISPDetected) {
    info.isSuspiciousChineseProxy = true;
  }
  
  // 如果是外国IP，但ASN是中国ASN，也可能是中国出口节点
  if (isForeignIP && info.isChineseASN) {
    info.isSuspiciousChineseProxy = true;
  }

  // 6. 额外检测：检查ISP名称中是否包含"回国"等关键词（VPN特征）
  if (ispLower.includes('回国') || ispLower.includes('出口') || 
      ispLower.includes('cn2') || ispLower.includes('gia') ||
      ispLower.includes('专线') || ispLower.includes('国际专线')) {
    info.isSuspiciousChineseProxy = true;
  }

  return info;
}

// 使用 ProxyCheck.io 检测代理/VPN (免费版每天100次)
async function checkProxyData(ip: string): Promise<{ isProxy: boolean; isVPN: boolean; proxyType?: string }> {
  try {
    // 使用免费API key，每天100次限制
    const response = await fetch(`https://proxycheck.io/v2/${ip}?key=free&vpn=1&asn=1`, {
      cache: 'no-store'
    });
    const data = await response.json();
    
    if (data.status === 'ok' && data[ip]) {
      const proxyStatus = data[ip].proxy;
      const proxyType = data[ip].type;
      
      // proxy: "yes" 表示是代理/VPN，type 可能包含 "VPN", "TOR", "SOCKS", "HTTP", "DATACENTER" 等
      const isProxy = proxyStatus === 'yes';
      const isVPN = isProxy && (proxyType === 'VPN' || proxyType === 'DATACENTER');
      
      return {
        isProxy,
        isVPN,
        proxyType
      };
    }
  } catch (error) {
    console.error('ProxyCheck API error:', error);
  }
  
  return { isProxy: false, isVPN: false };
}

// 检测IP纯净度（VPN、代理、Tor等）
async function checkCleanliness(ip: string, geoInfo: GeoInfo): Promise<CleanlinessResult> {
  try {
    // 使用 ipinfo.io 的黑名单检测 (付费功能，免费版不返回数据)
    const ipinfoResponse = await fetch(`https://ipinfo.io/${ip}/json`, {
      cache: 'no-store'
    });
    const ipinfoData = await ipinfoResponse.json();

    // 同时使用 ProxyCheck.io 检测代理/VPN (免费版每天100次)
    const proxyData = await checkProxyData(ip);

    const reasons: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    
    // 合并多个API的检测结果
    // ipinfo.io 的检测结果
    const ipinfoDatacenter = ipinfoData.hosting === true || ipinfoData.company?.type === 'hosting';
    const ipinfoProxy = ipinfoData.privacy?.proxy === true;
    const ipinfoVPN = ipinfoData.privacy?.vpn === true;
    const ipinfoTor = ipinfoData.privacy?.tor === true;
    const ipinfoHosting = ipinfoData.hosting === true;
    
    // ip-api.com 的检测结果 (免费且准确)
    const ipApiHosting = geoInfo.hosting === true;
    const ipApiProxy = geoInfo.proxy === true;
    
    // ProxyCheck.io 的检测结果 (优先使用，因为免费版也提供数据)
    const isProxy = ipinfoProxy || proxyData.isProxy || ipApiProxy;
    const isVPN = ipinfoVPN || proxyData.isVPN;
    const isTor = ipinfoTor;
    // 数据中心/托管服务：综合三个数据源
    const isDatacenter = ipinfoDatacenter || ipApiHosting || proxyData.proxyType === 'DATACENTER';
    const isHosting = ipinfoHosting || ipApiHosting;

    // 检测是否为中国IP
    const chineseIPInfo = await checkChineseMarkedIP(ip, geoInfo);

    if (isDatacenter) {
      reasons.push('数据中心/托管服务');
    }
    if (isProxy) {
      reasons.push('代理服务器');
      riskLevel = 'high';
    }
    if (isVPN) {
      reasons.push('VPN服务');
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
    }
    if (isTor) {
      reasons.push('Tor出口节点');
      riskLevel = 'high';
    }
    if (isHosting) {
      reasons.push('托管服务');
      if (riskLevel !== 'high') riskLevel = 'medium';
    }

    // 中国IP相关原因
    // 正常情况：中国大陆/港澳台IP
    if (chineseIPInfo?.isChinaMainland) {
      reasons.push('IP位于中国大陆');
    }
    if (chineseIPInfo?.isHongKong) {
      reasons.push('IP位于香港');
    }
    if (chineseIPInfo?.isTaiwan) {
      reasons.push('IP位于台湾');
    }
    if (chineseIPInfo?.isMacau) {
      reasons.push('IP位于澳门');
    }
    
    // 异常情况：非中国地理位置但被标记为中国IP（VPN/代理出口）
    if (chineseIPInfo?.isSuspiciousChineseProxy) {
      const isNormalChinaIP = chineseIPInfo?.isChinaMainland || chineseIPInfo?.isHongKong || 
                             chineseIPInfo?.isTaiwan || chineseIPInfo?.isMacau;
      if (!isNormalChinaIP) {
        // 只有非中国地理位置才提示这个
        reasons.push('被标记为中国IP（可能是VPN/代理出口节点）');
        if (riskLevel !== 'high') riskLevel = 'medium';
      }
    }

    // isChineseIP: 是否被标记为中国IP（包含正常情况和异常情况）
    const isMarkedAsChineseIP = 
      (chineseIPInfo?.isChinaMainland || chineseIPInfo?.isHongKong || 
       chineseIPInfo?.isTaiwan || chineseIPInfo?.isMacau) ||
      (chineseIPInfo?.isChineseISP && !chineseIPInfo?.isChinaMainland);

    // 计算精确的纯净度分数
    const cleanlinessScore = calculateCleanlinessScore(
      isProxy,
      isVPN,
      isTor,
      isHosting,
      isDatacenter,
      chineseIPInfo
    );

    return {
      isClean: reasons.length === 0,
      riskLevel,
      cleanlinessScore,
      reasons,
      details: {
        isProxy,
        isVPN,
        isTor,
        isHosting,
        isDatacenter,
        isChineseIP: isMarkedAsChineseIP || false
      },
      chineseIPInfo
    };
  } catch (error) {
    console.error('Cleanliness check failed:', error);
    return {
      isClean: true,
      riskLevel: 'low',
      cleanlinessScore: 100,
      reasons: [],
      details: {
        isProxy: false,
        isVPN: false,
        isTor: false,
        isHosting: false,
        isDatacenter: false,
        isChineseIP: false
      }
    };
  }
}

// ASN查询
async function getASNInfo(asn: string): Promise<ASNInfo | null> {
  if (!asn) return null;
  
  try {
    // 使用 RIPEstat API
    const response = await fetch(`https://stat.ripe.net/data/whois/data.json?resource=AS${asn}`, {
      cache: 'no-store'
    });
    const data = await response.json();
    
    if (data.status === 'ok' && data.data.records) {
      const records = data.data.records.records as Array<Array<{key: string; value: string}>>;
      const info: ASNInfo = {
        asn: `AS${asn}`,
        name: '',
        desc: '',
        holders: []
      };
      
      records.forEach((record) => {
        record.forEach((item) => {
          if (item.key === 'netname') info.name = item.value;
          if (item.key === 'descr') info.desc = item.value;
          if (item.key === 'origin') info.holders.push(item.value);
        });
      });
      
      return info;
    }
    return null;
  } catch (error) {
    console.error('ASN lookup failed:', error);
    return null;
  }
}

// 主API路由
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ip = searchParams.get('ip');
    const detect = searchParams.get('detect');

    // 如果请求的是自动检测模式，调用外部API获取真实IP
    if (detect === '1') {
      const apis = [
        'https://ifconfig.me/ip',
        'https://icanhazip.com',
        'https://checkip.amazonaws.com',
        'https://ipinfo.io/ip'
      ];
      
      for (const url of apis) {
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
          if (resp.ok) {
            const text = await resp.text();
            const detectedIP = text.trim();
            if (/^\d+\.\d+\.\d+\.\d+$/.test(detectedIP)) {
              // 获取到IP后，继续获取详细信息
              const geoInfo = await getGeoInfo(detectedIP);
              const [cleanliness, asnInfo] = await Promise.all([
                checkCleanliness(detectedIP, geoInfo),
                getASNInfo(geoInfo.asn)
              ]);
              return NextResponse.json({
                success: true,
                data: {
                  geo: geoInfo,
                  cleanliness,
                  asn: asnInfo
                }
              });
            }
          }
        } catch {}
      }
      return NextResponse.json({ success: false, error: '无法获取IP地址' }, { status: 500 });
    }

    let targetIP = ip;
    
    // 如果没有提供IP，从请求头获取客户端真实IP
    if (!targetIP) {
      // 尝试从各种CDN/代理头获取真实IP
      targetIP = 
        request.headers.get('cf-connecting-ip') ||    // Cloudflare
        request.headers.get('x-real-ip') ||           // Nginx代理
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || // 负载均衡
        request.headers.get('x-client-ip') ||          // 其他代理
        request.headers.get('forwarded')?.split(';')[0]?.replace('for=', '').trim() ||
        '127.0.0.1';
    }

    // 先获取地理位置信息（包含ASN）
    const geoInfo = await getGeoInfo(targetIP);
    
    // 并行获取纯净度和ASN信息
    const [cleanliness, asnInfo] = await Promise.all([
      checkCleanliness(targetIP, geoInfo),
      getASNInfo(geoInfo.asn)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        geo: geoInfo,
        cleanliness,
        asn: asnInfo
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: '查询失败，请稍后重试' },
      { status: 500 }
    );
  }
}
