import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@tokenwave/shared'],
  devIndicators: false,
  // Enable standalone output for Docker (copies only what's needed to run)
  output: 'standalone',
  // In a pnpm monorepo we must point file tracing at the repo root so Next
  // includes workspace deps (@tokenwave/shared etc.) in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
