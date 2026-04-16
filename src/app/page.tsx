'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WebRTCLeakDetector } from '@/components/detectors/WebRTCLeakDetector';
import { DNSLeakDetector } from '@/components/detectors/DNSLeakDetector';
import { 
  Globe, 
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
interface WebRTCResult {
  hasLeak: boolean;
  leakedIPs?: string[];
  candidateCount?: number;
  timestamp?: string;
  error?: string;
}

// DNS泄露检测结果
interface DNSLeakResult {
  dnsServer: string;
  dnsServerIP: string;
  resolvedIP: string | null;
  country: string;
  isp: string;
  success: boolean;
  error?: string;
}

interface DNSResult {
  hasLeak: boolean;
  leakLevel: 'none' | 'low' | 'medium' | 'high' | 'severe';
  explanation: string;
  testedServers?: DNSLeakResult[];
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
