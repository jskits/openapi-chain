import type { Metadata } from 'next';
import { Provider } from '@/components/provider';
import { appDescription, appName, siteUrl } from '@/lib/shared';
import './global.css';

const socialImage = {
  url: '/opengraph-image.png',
  width: 1280,
  height: 640,
  alt: `${appName}: type-safe OpenAPI requests that follow your document exactly`,
};

export const metadata: Metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title: { template: `%s | ${appName}`, default: appName },
  description: appDescription,
  openGraph: { images: [socialImage] },
  twitter: { card: 'summary_large_image', images: [socialImage] },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
