'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Globe, 
  Server, 
  Wifi, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Network,
  Eye,
  Lock
} from 'lucide-react';

// 类型定义
interface ServerResult {
  name: string;
  url: string;
  success: boolean;
  ips: string[];
  candidateCount: number;
  error?: string;
}

interface WebRTCResult {
  hasLeak: boolean;
  leakedIPs?: string[];
  candidateCount?: number;
  timestamp?: string;
  error?: string;
  serverResults?: ServerResult[];
}

interface DNSResult {
  hasLeak: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ispDNS?: any;
  testedServers?: Array<{
    name: string;
    server: string;
    ip: string;
    reachable: boolean;
    responseTime?: number;
    type: 'cn' | 'intl';
  }>;
  timestamp?: string;
  recommendations?: string[];
  error?: string;
}

// 双栈IP信息
interface DualStackIP {
  ipv4: {
    ip: string;
    version: 'ipv4';
    isDetected: boolean;
    geo?: GeoData;
    cleanliness?: CleanlinessData;
  };
  ipv6: {
    ip: string;
    version: 'ipv6';
    isDetected: boolean;
    geo?: GeoData;
    cleanliness?: CleanlinessData;
  };
}

interface GeoData {
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

interface CleanlinessData {
  isClean: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  cleanlinessScore: number;
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

interface ASNData {
  asn: string;
  name: string;
  desc: string;
  holders: string[];
}

interface IPData {
  geo: GeoData;
  cleanliness: CleanlinessData;
  asn: ASNData | null;
}

// 动态导入地图组件（避免SSR问题）
const MapComponent = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full bg-muted/20 rounded-lg flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
});

// WebRTC泄露检测组件
function WebRTCLeakDetector({ onResult }: { onResult: (result: WebRTCResult) => void }) {
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<WebRTCResult | null>(null);
  const [currentServer, setCurrentServer] = useState('');

  // STUN服务器列表（国内 + 国际）
  const stunServers = useMemo(() => [
    // 国内STUN服务器
    { name: '腾讯云', url: 'stun:stun.myacc.net:3478' },
    { name: '阿里云', url: 'stun:stun.aliyun.com:3478' },
    { name: '网易', url: 'stun:stun.163.com:3478' },
    { name: '百度', url: 'stun:stun.baidu.com:3478' },
    { name: '华为云', url: 'stun:stun.myhuaweicloud.com:3478' },
    { name: '融云', url: 'stun:score.rongzone.cn:3478' },
    // 国际STUN服务器
    { name: 'Google 1', url: 'stun:stun.l.google.com:19302' },
    { name: 'Google 2', url: 'stun:stun1.l.google.com:19302' },
    { name: 'Google 3', url: 'stun:stun2.l.google.com:19302' },
  ], []);

  // 检测单个STUN服务器
  const testSingleServer = async (server: { name: string; url: string }): Promise<ServerResult> => {
    return new Promise((resolve) => {
      const result: ServerResult = {
        name: server.name,
        url: server.url,
        success: false,
        ips: [],
        candidateCount: 0
      };

      let resolved = false;
      const doResolve = (r: ServerResult) => {
        if (!resolved) {
          resolved = true;
          resolve(r);
        }
      };

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: server.url }]
        });

        const collectedIPs: string[] = [];
        let candidateCount = 0;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidateCount++;
            const ipMatch = event.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/g);
            if (ipMatch) {
              collectedIPs.push(...ipMatch);
            }
          }
        };

        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            const uniqueIPs = [...new Set(collectedIPs)];
            result.success = true;
            result.ips = uniqueIPs;
            result.candidateCount = candidateCount;
            pc.close();
            doResolve(result);
          }
        };

        // 创建数据通道触发ICE候选收集
        pc.createDataChannel('test');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));

        // 超时处理
        setTimeout(() => {
          if (pc.iceGatheringState !== 'complete') {
            const uniqueIPs = [...new Set(collectedIPs)];
            result.success = true;
            result.ips = uniqueIPs;
            result.candidateCount = candidateCount;
            pc.close();
            doResolve(result);
          }
        }, 3000);

      } catch {
        result.success = false;
        result.error = '连接失败';
        doResolve(result);
      }
    });
  };

  const detect = useCallback(async () => {
    setDetecting(true);
    setResult(null);

    const serverResults: ServerResult[] = [];
    const allLeakedIPs: string[] = [];
    let totalCandidates = 0;

    try {
      // 逐个测试STUN服务器
      for (const server of stunServers) {
        setCurrentServer(server.name);
        
        const serverResult = await testSingleServer(server);
        serverResults.push(serverResult);
        
        if (serverResult.ips.length > 0) {
          allLeakedIPs.push(...serverResult.ips);
        }
        totalCandidates += serverResult.candidateCount;
      }

      const uniqueLeakedIPs = [...new Set(allLeakedIPs)];
      const hasLeak = uniqueLeakedIPs.length > 0;

      const detectionResult: WebRTCResult = {
        hasLeak,
        leakedIPs: uniqueLeakedIPs,
        candidateCount: totalCandidates,
        timestamp: new Date().toISOString(),
        serverResults
      };

      setResult(detectionResult);
      onResult(detectionResult);
    } catch (error) {
      console.error('WebRTC detection error:', error);
      const errorResult: WebRTCResult = {
        hasLeak: false,
        error: '检测失败',
        serverResults
      };
      setResult(errorResult);
      onResult(errorResult);
    } finally {
      setDetecting(false);
      setCurrentServer('');
    }
  }, [onResult, stunServers]);

  return (
    <div className="space-y-3">
      <Button 
        onClick={detect} 
        disabled={detecting}
        variant="outline"
        className="w-full"
      >
        {detecting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {currentServer ? `正在检测 ${currentServer}...` : '检测中...'}
          </>
        ) : (
          <>
            <Wifi className="mr-2 h-4 w-4" />
            检测WebRTC泄露
          </>
        )}
      </Button>
      
      {result && (
        <div className={`p-3 rounded-lg ${result.hasLeak ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
          <div className="flex items-center gap-2">
            {result.hasLeak ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            <span className="font-medium">
              {result.hasLeak ? '检测到WebRTC泄露' : '未检测到泄露'}
            </span>
          </div>
          
          {/* 每个服务器的检测结果 */}
          {result.serverResults && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">各服务器检测结果:</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.serverResults.map((server, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2 rounded text-xs ${
                      server.ips.length > 0 
                        ? 'bg-yellow-500/10 border border-yellow-500/20' 
                        : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{server.name}</span>
                      <Badge 
                        variant={server.ips.length > 0 ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {server.ips.length > 0 
                          ? `检测到 ${server.ips.length} 个IP` 
                          : server.success 
                            ? '无泄露' 
                            : server.error || '失败'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground/60 mt-0.5 font-mono">{server.url}</p>
                    {server.ips.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {server.ips.map((ip, ipIdx) => (
                          <Badge key={ipIdx} variant="outline" className="font-mono text-xs">
                            {ip}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {server.candidateCount > 0 && (
                      <p className="text-muted-foreground/60 mt-1">
                        候选数: {server.candidateCount}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 总泄露IP列表 */}
          {result.hasLeak && result.leakedIPs && result.leakedIPs.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">总泄露IP ({result.leakedIPs.length}个):</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {result.leakedIPs.map((ip: string, idx: number) => (
                  <Badge key={idx} variant="destructive" className="font-mono text-xs">
                    {ip}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {result.error && (
            <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// DNS泄露检测组件
function DNSLeakDetector({ onResult }: { onResult: (result: DNSResult) => void }) {
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<DNSResult | null>(null);

  const detect = useCallback(async () => {
    setDetecting(true);
    setResult(null);

    try {
      // DNS-over-HTTPS (DoH) 服务器列表
      const dohServers = [
        { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query', ip: '1.1.1.1', type: 'intl' as const },
        { name: 'Google', url: 'https://dns.google/resolve', ip: '8.8.8.8', type: 'intl' as const },
        { name: 'Quad9', url: 'https://dns.quad9.net:5053/dns-query', ip: '9.9.9.9', type: 'intl' as const },
        { name: '阿里DNS', url: 'https://dns.alidns.com/resolve', ip: '223.5.5.5', type: 'cn' as const },
        { name: '腾讯DNS', url: 'https://doh.pub/resolve', ip: '119.29.29.29', type: 'cn' as const },
      ];

      const testResults: Array<{
        name: string;
        server: string;
        ip: string;
        reachable: boolean;
        responseTime?: number;
        type: 'cn' | 'intl';
        asn?: string;
        isp?: string;
        country?: string;
      }> = [];

      // 生成随机测试域名
      const randomSubdomain = `test-${Date.now()}-${Math.random().toString(36).substring(7)}.example.com`;

      // 并行检测所有DoH服务器
      const testPromises = dohServers.map(async (server) => {
        const startTime = performance.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const url = server.url.includes('dns.google') 
            ? `${server.url}?name=${randomSubdomain}&type=A`
            : `${server.url}?name=${randomSubdomain}&type=A`;

          const resp = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/dns-json'
            },
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          const endTime = performance.now();

          if (resp.ok) {
            return {
              name: server.name,
              server: server.name,
              ip: server.ip,
              reachable: true,
              responseTime: Math.round(endTime - startTime),
              type: server.type
            };
          }
          return {
            name: server.name,
            server: server.name,
            ip: server.ip,
            reachable: false,
            type: server.type
          };
        } catch {
          return {
            name: server.name,
            server: server.name,
            ip: server.ip,
            reachable: false,
            type: server.type
          };
        }
      });

      // 最多等待10秒
      const results = await Promise.race([
        Promise.all(testPromises),
        new Promise<typeof testResults>((resolve) => setTimeout(() => resolve([]), 10000))
      ]);

      if (results.length > 0) {
        testResults.push(...results);
      }

      // 判断是否有泄露（国内DoH服务器可达说明国内DNS被使用）
      const reachableCN = testResults.filter(r => r.reachable && r.type === 'cn');
      const reachableIntl = testResults.filter(r => r.reachable && r.type === 'intl');
      const hasLeak = reachableCN.length > 0 && reachableIntl.length === 0;

      setResult({
        hasLeak,
        testedServers: testResults,
        timestamp: new Date().toISOString(),
        recommendations: hasLeak ? [
          '检测到DNS泄露风险，建议使用VPN',
          '启用DNS over HTTPS加密DNS查询'
        ] : [
          'DNS泄露检测通过',
          '您的DNS查询相对安全'
        ]
      });
      onResult({
        hasLeak,
        testedServers: testResults,
        timestamp: new Date().toISOString(),
        recommendations: hasLeak ? [
          '检测到DNS泄露风险，建议使用VPN',
          '启用DNS over HTTPS加密DNS查询'
        ] : [
          'DNS泄露检测通过',
          '您的DNS查询相对安全'
        ]
      });
    } catch {
      setResult({
        hasLeak: false,
        error: '检测失败'
      });
      onResult({
        hasLeak: false,
        error: '检测失败'
      });
    } finally {
      setDetecting(false);
    }
  }, [onResult]);

  return (
    <div className="space-y-3">
      <Button 
        onClick={detect} 
        disabled={detecting}
        variant="outline"
        className="w-full"
      >
        {detecting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            检测中...
          </>
        ) : (
          <>
            <Network className="mr-2 h-4 w-4" />
            检测DNS泄露
          </>
        )}
      </Button>
      
      {result && (
        <div className={`p-3 rounded-lg ${result.hasLeak ? 'bg-yellow-500/10' : 'bg-green-500/10'}`}>
          <div className="flex items-center gap-2">
            {result.hasLeak ? (
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            <span className="font-medium">
              {result.hasLeak ? '可能存在DNS泄露风险' : 'DNS泄露检测通过'}
            </span>
          </div>
          
          {/* DNS服务器测试结果 */}
          {result.testedServers && result.testedServers.length > 0 && (
            <div className="mt-3 space-y-4">
              {/* 国内DNS */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <span className="text-red-500">●</span> 国内DNS
                </p>
                <div className="space-y-1">
                  {result.testedServers.filter(s => s.type === 'cn').map((server, idx) => (
                    <div key={`cn-${idx}`} className="flex items-center justify-between text-sm bg-background/50 rounded p-2">
                      <div className="flex items-center gap-2">
                        {server.reachable ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{server.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">{server.ip}</span>
                      </div>
                      {server.responseTime !== undefined && (
                        <span className={`text-xs ${server.responseTime < 50 ? 'text-green-600' : server.responseTime < 100 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {server.responseTime}ms
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 国际DNS */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <span className="text-blue-500">●</span> 国际DNS
                </p>
                <div className="space-y-1">
                  {result.testedServers.filter(s => s.type === 'intl').map((server, idx) => (
                    <div key={`intl-${idx}`} className="flex items-center justify-between text-sm bg-background/50 rounded p-2">
                      <div className="flex items-center gap-2">
                        {server.reachable ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{server.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">{server.ip}</span>
                      </div>
                      {server.responseTime !== undefined && (
                        <span className={`text-xs ${server.responseTime < 100 ? 'text-green-600' : server.responseTime < 300 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {server.responseTime}ms
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="text-muted-foreground mb-1">安全建议:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-xs text-muted-foreground">{rec}</li>
                ))}
              </ul>
            </div>
          )}
          
          {result.error && (
            <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// 风险等级指示器
function RiskIndicator({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { color: 'bg-green-500', text: '低风险', desc: 'IP较为纯净' },
    medium: { color: 'bg-yellow-500', text: '中风险', desc: '存在一定风险' },
    high: { color: 'bg-red-500', text: '高风险', desc: 'IP存在明显风险' }
  };
  
  const { color, text, desc } = config[level];
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="font-medium">{text}</span>
      <span className="text-muted-foreground text-sm">({desc})</span>
    </div>
  );
}

// 国家旗帜emoji
function CountryFlag({ code }: { code: string }) {
  if (!code || code.length !== 2) return null;
  
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return (
    <span className="text-2xl" title={code}>
      {String.fromCodePoint(...codePoints)}
    </span>
  );
}

// 主页面组件
export default function IPQueryPage() {
  const [ipInput, setIpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ipData, setIpData] = useState<IPData | null>(null);
  const [dualStackIP, setDualStackIP] = useState<DualStackIP | null>(null);
  const [dualStackLoading, setDualStackLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentIP, setCurrentIP] = useState('');
  const [webrtcResult, setWebrtcResult] = useState<WebRTCResult | null>(null);
  const [dnsResult, setDnsResult] = useState<DNSResult | null>(null);

  // 获取当前公网IP
  useEffect(() => {
    const fetchCurrentIP = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/ipinfo', {
          signal: AbortSignal.timeout(8000)
        });
        const data = await response.json();
        
        if (data.success) {
          setCurrentIP(data.data.geo.ip);
          setIpData(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch current IP:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCurrentIP();
  }, []);

  // 获取双栈IP信息 - 使用支持CORS的API获取真实IP
  useEffect(() => {
    const fetchDualStackIP = async () => {
      setDualStackLoading(true);
      try {
        // 使用支持CORS的API获取IPv4
        const fetchIPv4 = async (): Promise<string> => {
          const apis = [
            { url: 'https://ipapi.co/json/', parser: (text: string) => {
              try {
                const json = JSON.parse(text);
                return json.ip || '';
              } catch { return ''; }
            }},
            { url: 'https://ifconfig.me/ip', parser: (text: string) => text.trim() },
            { url: 'https://icanhazip.com', parser: (text: string) => text.trim() },
            { url: 'https://checkip.amazonaws.com', parser: (text: string) => text.trim() },
            { url: 'https://ipinfo.io/ip', parser: (text: string) => text.trim() },
          ];
          
          for (const api of apis) {
            try {
              const resp = await fetch(api.url, { 
                signal: AbortSignal.timeout(5000),
                cache: 'no-store'
              });
              if (resp.ok) {
                const text = await resp.text();
                const ip = api.parser(text);
                if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
              }
            } catch {}
          }
          return '';
        };

        // 获取IPv6
        const fetchIPv6 = async (): Promise<string> => {
          try {
            const resp = await fetch('https://v6.ident.me', { signal: AbortSignal.timeout(5000) });
            if (resp.ok) {
              const ip = (await resp.text()).trim();
              if (ip.includes(':')) return ip;
            }
          } catch {}
          return '';
        };

        // 并行获取
        const [ipv4IP, ipv6IP] = await Promise.all([fetchIPv4(), fetchIPv6()]);

        const dualStack: DualStackIP = {
          ipv4: {
            ip: ipv4IP || '未检测到',
            version: 'ipv4',
            isDetected: !!ipv4IP
          },
          ipv6: {
            ip: ipv6IP || '未检测到IPv6',
            version: 'ipv6',
            isDetected: !!ipv6IP
          }
        };

        // 获取详细信息
        const detailsPromises: Promise<void>[] = [];

        if (dualStack.ipv4.isDetected) {
          detailsPromises.push(
            fetch(`/api/ipinfo?ip=${dualStack.ipv4.ip}`, { signal: AbortSignal.timeout(8000) })
              .then(res => res.json())
              .then(result => {
                if (result.success) {
                  dualStack.ipv4.geo = result.data.geo;
                  dualStack.ipv4.cleanliness = result.data.cleanliness;
                }
              })
              .catch(() => {})
          );
        }

        if (dualStack.ipv6.isDetected) {
          detailsPromises.push(
            fetch(`/api/ipinfo?ip=${dualStack.ipv6.ip}`, { signal: AbortSignal.timeout(8000) })
              .then(res => res.json())
              .then(result => {
                if (result.success) {
                  dualStack.ipv6.geo = result.data.geo;
                  dualStack.ipv6.cleanliness = result.data.cleanliness;
                }
              })
              .catch(() => {})
          );
        }

        await Promise.all(detailsPromises);
        setDualStackIP(dualStack);
        if (dualStack.ipv4.isDetected) {
          setCurrentIP(dualStack.ipv4.ip);
        }
      } catch (err) {
        console.error('Failed to fetch dual stack IP:', err);
      } finally {
        setDualStackLoading(false);
      }
    };

    fetchDualStackIP();
  }, []);

  // 查询IP信息
  const handleQuery = useCallback(async (ip?: string) => {
    const targetIP = ip || ipInput.trim() || currentIP;
    if (!targetIP) return;
    
    setLoading(true);
    setError('');
    setIpData(null);
    
    try {
      const response = await fetch(`/api/ipinfo?ip=${targetIP}`);
      const data = await response.json();
      
      if (data.success) {
        setIpData(data.data);
        setCurrentIP(data.data.geo.ip);
      } else {
        setError(data.error || '查询失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [ipInput, currentIP]);

  // 回车查询
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuery();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">IP查询工具</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleQuery()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* 搜索区域 */}
        <div className="max-w-2xl mx-auto mb-8">
          <Card className="shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                IP地址查询
              </CardTitle>
              <CardDescription>
                输入IP地址或域名查询详细信息，或直接点击查询获取当前IP信息
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder={currentIP || '输入IP地址或域名'}
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="font-mono"
                />
                <Button 
                  onClick={() => handleQuery()} 
                  disabled={loading}
                  className="shrink-0"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    '查询'
                  )}
                </Button>
              </div>
              
              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* 当前IP快速查询 */}
              {currentIP && !ipData && (
                <div className="text-center text-sm text-muted-foreground">
                  当前IP: <span className="font-mono font-medium">{currentIP}</span>
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={() => handleQuery(currentIP)}
                    className="ml-2"
                  >
                    查询详情
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 双栈IP信息卡片 - 拆分显示 */}
        {dualStackIP && (
          <div className="max-w-6xl mx-auto mb-8 space-y-4">
            {/* IPv4 卡片 */}
            <Card className="shadow-lg border-2 border-blue-300 dark:border-blue-700">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Badge variant="default" className="bg-blue-500">IPv4</Badge>
                  {dualStackIP.ipv4.isDetected ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  {dualStackLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dualStackIP.ipv4.isDetected && dualStackIP.ipv4.geo ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <CountryFlag code={dualStackIP.ipv4.geo.countryCode} />
                      <span className="font-mono font-bold text-xl">{dualStackIP.ipv4.ip}</span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm">
                          <p className="text-muted-foreground">
                            {dualStackIP.ipv4.geo.city}, {dualStackIP.ipv4.geo.region}, {dualStackIP.ipv4.geo.country}
                          </p>
                          <p><span className="text-muted-foreground">ISP:</span> {dualStackIP.ipv4.geo.isp}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {dualStackIP.ipv4.geo.latitude.toFixed(4)}, {dualStackIP.ipv4.geo.longitude.toFixed(4)}
                          </p>
                        </div>
                        {dualStackIP.ipv4.cleanliness && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">纯净度:</span>
                              <span className={`font-bold ${
                                dualStackIP.ipv4.cleanliness.cleanlinessScore >= 80 ? 'text-green-600' :
                                dualStackIP.ipv4.cleanliness.cleanlinessScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {dualStackIP.ipv4.cleanliness.cleanlinessScore}%
                              </span>
                            </div>
                            {dualStackIP.ipv4.cleanliness.reasons.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {dualStackIP.ipv4.cleanliness.reasons.join(' | ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="h-[200px] rounded-lg overflow-hidden border">
                        <MapComponent
                          lat={dualStackIP.ipv4.geo.latitude}
                          lng={dualStackIP.ipv4.geo.longitude}
                          location={`${dualStackIP.ipv4.geo.city}, ${dualStackIP.ipv4.geo.country}`}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{dualStackIP.ipv4.ip}</p>
                )}
              </CardContent>
            </Card>

            {/* IPv6 卡片 */}
            <Card className="shadow-lg border-2 border-purple-300 dark:border-purple-700">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                  <Badge variant="default" className="bg-purple-500">IPv6</Badge>
                  {dualStackIP.ipv6.isDetected ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  {dualStackLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dualStackIP.ipv6.isDetected && dualStackIP.ipv6.geo ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <CountryFlag code={dualStackIP.ipv6.geo.countryCode} />
                      <span className="font-mono text-sm break-all">{dualStackIP.ipv6.ip}</span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-sm">
                          <p className="text-muted-foreground">
                            {dualStackIP.ipv6.geo.city}, {dualStackIP.ipv6.geo.region}, {dualStackIP.ipv6.geo.country}
                          </p>
                          <p><span className="text-muted-foreground">ISP:</span> {dualStackIP.ipv6.geo.isp}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {dualStackIP.ipv6.geo.latitude.toFixed(4)}, {dualStackIP.ipv6.geo.longitude.toFixed(4)}
                          </p>
                        </div>
                        {dualStackIP.ipv6.cleanliness && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">纯净度:</span>
                              <span className={`font-bold ${
                                dualStackIP.ipv6.cleanliness.cleanlinessScore >= 80 ? 'text-green-600' :
                                dualStackIP.ipv6.cleanliness.cleanlinessScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {dualStackIP.ipv6.cleanliness.cleanlinessScore}%
                              </span>
                            </div>
                            {dualStackIP.ipv6.cleanliness.reasons.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {dualStackIP.ipv6.cleanliness.reasons.join(' | ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="h-[200px] rounded-lg overflow-hidden border">
                        <MapComponent
                          lat={dualStackIP.ipv6.geo.latitude}
                          lng={dualStackIP.ipv6.geo.longitude}
                          location={`${dualStackIP.ipv6.geo.city}, ${dualStackIP.ipv6.geo.country}`}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{dualStackIP.ipv6.ip}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 隐私泄露检测与安全建议 */}
        <div className="grid gap-6 max-w-6xl mx-auto">
          {/* WebRTC泄露检测 */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                WebRTC泄露检测
              </CardTitle>
              <CardDescription>
                检测浏览器WebRTC是否泄露真实IP地址
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WebRTCLeakDetector onResult={setWebrtcResult} />
              
              {webrtcResult && !webrtcResult.hasLeak && !webrtcResult.error && (
                <div className="mt-4 p-3 bg-green-500/10 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600">
                    <Lock className="h-4 w-4" />
                    <span className="text-sm font-medium">您的WebRTC设置是安全的</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    未检测到本地IP泄露
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DNS泄露检测 */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                DNS泄露检测
              </CardTitle>
              <CardDescription>
                检测DNS查询是否通过安全渠道
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DNSLeakDetector onResult={setDnsResult} />
              
              {dnsResult && !dnsResult.hasLeak && !dnsResult.error && (
                <div className="mt-4 p-3 bg-green-500/10 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600">
                    <Lock className="h-4 w-4" />
                    <span className="text-sm font-medium">您的DNS查询是安全的</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    DNS查询未泄露至第三方
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">正在查询IP信息...</p>
            </div>
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="border-t mt-12 py-6">
        <div className="container px-4 text-center text-sm text-muted-foreground">
          <p>本网页完全由AI生成</p>
          <p className="mt-1">IP查询工具 - 仅供学习和研究使用</p>
        </div>
      </footer>
    </div>
  );
}

// 搜索图标组件
function Search({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
