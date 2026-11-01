/** @type {import('next').NextConfig} */

// GitHub Pages project site: https://jokitugasbykay.github.io/keuangan.github.io/
// Local / Vercel: leave BASE_PATH empty so routes stay at /
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
