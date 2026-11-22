import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Data is fetched per request unless explicitly cached ("use cache").
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // The repo has lockfiles at the root and in frontend/; pin the project
    // root to this folder so Next.js doesn't have to guess.
    root: path.join(__dirname),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
