// next.config.js

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  experimental: {
    runtime: 'edge',
  },
};

module.exports = nextConfig;