import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'openapi-chain';
export const appDescription =
  'A type-safe OpenAPI client for complex and large APIs, whose requests follow the document’s wire rules exactly.';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// Absolute URL of the deployed site, including its base path, for canonical and social metadata.
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jskits.github.io/openapi-chain';

export const gitConfig = {
  user: 'jskits',
  repo: 'openapi-chain',
  branch: 'main',
};
export const repositoryUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
