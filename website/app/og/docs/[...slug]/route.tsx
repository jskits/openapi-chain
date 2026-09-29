import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { generateOGImage } from 'fumadocs-ui/og';
import { appName, getPageImageUrl } from '@/lib/shared';

export const revalidate = false;

// Images are rendered at build time; embed the logo so rendering needs no network request.
const logo = `data:image/png;base64,${readFileSync(
  join(process.cwd(), '../assets/logo/openapi-chain-icon-256.png'),
).toString('base64')}`;

export async function GET(_req: Request, { params }: RouteContext<'/og/docs/[...slug]'>) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: appName,
    // ImageResponse renders plain elements; next/image cannot run inside it.
    // eslint-disable-next-line @next/next/no-img-element
    icon: <img src={logo} alt="" width={72} height={72} />,
    primaryColor: 'rgba(45, 212, 191, 0.35)',
    primaryTextColor: 'rgb(94, 234, 212)',
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }));
}
