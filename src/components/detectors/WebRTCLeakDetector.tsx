'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';

// WebRTC检测结果类型
export interface ServerResult {
  name: string;
  url: string;
  success: boolean;
  ips: string[];
  candidateCount: number;
  error?: string;
}

export interface WebRTCResult {
  hasLeak: boolean;
  leakedIPs?: string[];
  candidateCount?: number;
  timestamp?: string;
  error?: string;
  serverResults?: ServerResult[];
}

interface WebRTCLeakDetectorProps {
  onResult: (result: WebRTCResult) => void;
}

// WebRTC泄露检测组件
export function WebRTCLeakDetector({ onResult }: WebRTCLeakDetectorProps) {
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
  const testSingleServer = useCallback(async (server: { name: string; url: string }): Promise<ServerResult> => {
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
  }, []);

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
  }, [onResult, stunServers, testSingleServer]);

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

export default WebRTCLeakDetector;
