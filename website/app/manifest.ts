import type { MetadataRoute } from 'next';
import { appDescription, appName } from '@/lib/shared';

export const dynamic = 'force-static';

// Relative URLs resolve against the manifest, so they keep the GitHub Pages base path.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    description: appDescription,
    start_url: './',
    display: 'standalone',
    theme_color: '#0B1220',
    background_color: '#0B1220',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
