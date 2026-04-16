'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Network
} from 'lucide-react';

// DNS泄露检测结果类型
export interface DNSLeakResult {
  dnsServer: string;
  dnsServerIP: string;
  resolvedIP: string | null;
  country: string;
  isp: string;
  success: boolean;
  error?: string;
}

export interface DNSResult {
  hasLeak: boolean;
  leakLevel: 'none' | 'low' | 'medium' | 'high' | 'severe';
  explanation: string;
  testedServers?: DNSLeakResult[];
  timestamp?: string;
  recommendations?: string[];
  error?: string;
}

interface DNSLeakDetectorProps {
  onResult: (result: DNSResult) => void;
}

// DNS泄露检测组件
// 原理：DNS泄露是指用户的DNS查询请求绕过加密通道（如VPN或代理），
// 通过本地网络发送，导致真实IP地址和浏览记录暴露。
// 检测方法：生成唯一的随机子域名，通过多个DNS服务器查询该域名，
// 分析返回的DNS服务器IP与用户公网IP的关系，判断是否存在泄露。
export function DNSLeakDetector({ onResult }: DNSLeakDetectorProps) {
  const [detecting, setDetecting] = useState(false);
  const [result, setResult] = useState<DNSResult | null>(null);

  const detect = useCallback(async () => {
    setDetecting(true);
    setResult(null);

    try {
      const response = await fetch('/api/dns-leak', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        const dnsResult: DNSResult = {
          hasLeak: data.leakInfo.isLeaking,
          leakLevel: data.leakInfo.leakLevel,
          explanation: data.leakInfo.explanation,
          testedServers: data.results,
          timestamp: data.timestamp,
          recommendations: data.recommendations
        };
        setResult(dnsResult);
        onResult(dnsResult);
      } else {
        const errorResult: DNSResult = {
          hasLeak: false,
          leakLevel: 'low',
          explanation: '检测失败，请重试',
          error: data.error
        };
        setResult(errorResult);
        onResult(errorResult);
      }
    } catch {
      const errorResult: DNSResult = {
        hasLeak: false,
        leakLevel: 'low',
        explanation: '检测失败，请检查网络连接',
        error: '网络错误'
      };
      setResult(errorResult);
      onResult(errorResult);
    } finally {
      setDetecting(false);
    }
  }, [onResult]);

  const getLeakLevelColor = (level: DNSResult['leakLevel']) => {
    switch (level) {
      case 'none': return 'text-green-500';
      case 'low': return 'text-blue-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-orange-500';
      case 'severe': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getLeakLevelBg = (level: DNSResult['leakLevel']) => {
    switch (level) {
      case 'none': return 'bg-green-500/10';
      case 'low': return 'bg-blue-500/10';
      case 'medium': return 'bg-yellow-500/10';
      case 'high': return 'bg-orange-500/10';
      case 'severe': return 'bg-red-500/10';
      default: return 'bg-gray-500/10';
    }
  };

  const getLeakLevelText = (level: DNSResult['leakLevel']) => {
    switch (level) {
      case 'none': return '安全';
      case 'low': return '低风险';
      case 'medium': return '中风险';
      case 'high': return '高风险';
      case 'severe': return '严重风险';
      default: return '未知';
    }
  };

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
        <div className={getLeakLevelBg(result.leakLevel)}>
          <div className="p-3">
            <div className="flex items-center gap-2">
              {result.leakLevel === 'none' ? (
                <CheckCircle className={`h-5 w-5 ${getLeakLevelColor(result.leakLevel)}`} />
              ) : (
                <AlertTriangle className={`h-5 w-5 ${getLeakLevelColor(result.leakLevel)}`} />
              )}
              <span className={`font-medium ${getLeakLevelColor(result.leakLevel)}`}>
                {getLeakLevelText(result.leakLevel)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{result.explanation}</p>
          </div>
          
          {result.testedServers && result.testedServers.length > 0 && (
            <div className="px-3 pb-3 space-y-4">
              <div className="text-sm font-medium mb-2">DNS服务器响应情况</div>
              <div className="space-y-2">
                {result.testedServers.map((server, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm bg-background/50 rounded p-2">
                    <div className="flex items-center gap-2">
                      {server.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{server.dnsServer}</span>
                      <span className="text-muted-foreground font-mono text-xs">{server.dnsServerIP}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{server.country}</span>
                      {server.resolvedIP && (
                        <span className="text-xs font-mono text-green-600">{server.resolvedIP}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {result.recommendations && result.recommendations.length > 0 && (
            <div className="px-3 pb-3 text-sm">
              <p className="text-muted-foreground mb-1 font-medium">安全建议:</p>
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

export default DNSLeakDetector;
