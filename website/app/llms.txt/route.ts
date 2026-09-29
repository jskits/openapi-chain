import { withAbsoluteLinks } from '@/lib/llms';
import { docsLlms } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  return new Response(withAbsoluteLinks(await docsLlms.index()));
}
