import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

const localNetworkOrigins = Object.values(networkInterfaces()).flatMap(
  (addresses) =>
    (addresses ?? [])
      .filter((address) => !address.internal && address.family === 'IPv4')
      .map((address) => address.address),
);

const allowedDevOrigins = [
  ...new Set([
    'localhost',
    '127.0.0.1',
    ...localNetworkOrigins,
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
