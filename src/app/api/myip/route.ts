import { NextRequest, NextResponse } from 'next/server';

// Edge Runtime配置
export const runtime = 'edge';
export const preferredRegion = 'auto';

interface IPInfo {
  ip: string;
  version: 'ipv4' | 'ipv6';
  isDetected: boolean;
}

interface MyIPResponse {
  success: boolean;
  ipv4?: IPInfo;
  ipv6?: IPInfo;
  error?: string;
}

// 检测是否为IPv6地址
function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

// 获取用户的IPv4地址
async function getIPv4Address(): Promise<IPInfo> {
  try {
    // 使用 ifconfig.me 获取IPv4
    const response = await fetch('https://ifconfig.me/ip', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const ip = (await response.text()).trim();
      if (/^[\d.]+$/.test(ip)) {
        return {
          ip,
          version: 'ipv4',
          isDetected: true
        };
      }
    }
  } catch (error) {
    console.error('Failed to get IPv4:', error);
  }

  return {
    ip: '未检测到',
    version: 'ipv4',
    isDetected: false
  };
}

// 获取用户的IPv6地址
async function getIPv6Address(): Promise<IPInfo> {
  try {
    // 使用 v6.ident.me 获取IPv6
    const response = await fetch('https://v6.ident.me', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const ip = (await response.text()).trim();
      if (ip.includes(':')) {
        return {
          ip,
          version: 'ipv6',
          isDetected: true
        };
      }
    }
  } catch (error) {
    console.error('Failed to get IPv6:', error);
  }

  return {
    ip: '未检测到IPv6',
    version: 'ipv6',
    isDetected: false
  };
}

export async function GET(request: NextRequest) {
  try {
    // 并行获取IPv4和IPv6
    const [ipv4, ipv6] = await Promise.all([
      getIPv4Address(),
      getIPv6Address()
    ]);

    const response: MyIPResponse = {
      success: true,
      ipv4,
      ipv6
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('MyIP detection error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to detect IP addresses'
    }, { status: 500 });
  }
}
