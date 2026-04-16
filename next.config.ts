import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cloudflare Pages 兼容性配置
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
