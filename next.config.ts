import type { NextConfig } from 'next';

const allowedDevOrigins = [
  ...new Set([
    'localhost',
    '127.0.0.1',
    ...(process.env.PRAXIS_ALLOWED_DEV_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]),
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  serverExternalPackages: [
    '@deepseek-ai/dsh-app-boot',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-base',
  ],
};

export default nextConfig;
