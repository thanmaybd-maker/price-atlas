import type { NextConfig } from 'next';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });
const config: NextConfig = {
  distDir: '../../.next',
  devIndicators: false,
  serverExternalPackages: ['node:sqlite', 'pg'],
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
