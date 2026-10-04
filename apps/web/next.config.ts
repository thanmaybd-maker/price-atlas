import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  distDir: '../../.next',
  devIndicators: false,
  serverExternalPackages: ['node:sqlite'],
  poweredByHeader: false,
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
