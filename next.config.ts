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
};

export default nextConfig;
