import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const revalidate = false;

// Exported with a .png extension so static hosts serve it as an image, not an octet stream.
// The repository social preview is the site's default image; docs pages render their own.
export function GET() {
  return new Response(
    readFileSync(join(process.cwd(), '../assets/logo/openapi-chain-social-1280x640.png')),
    { headers: { 'Content-Type': 'image/png' } },
  );
}
