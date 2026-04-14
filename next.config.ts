import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cloudflare Pages 兼容性配置
  images: {
    unoptimized: true,
  },
  // 禁用 serverActions 以避免兼容性问题
  experimental: {
    // serverActions: false,
  },
};

export default nextConfig;
