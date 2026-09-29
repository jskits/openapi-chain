import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// GitHub Pages serves a project site below /<repository>; local builds use the root.
const basePath = process.env.DOCS_BASE_PATH || undefined;

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath ?? '',
    ...(process.env.DOCS_SITE_URL && { NEXT_PUBLIC_SITE_URL: process.env.DOCS_SITE_URL }),
  },
};

export default withMDX(config);
