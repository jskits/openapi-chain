import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

// Archived qualification reports record past behavior. Index their titles and descriptions only,
// so searches land on current guides and the static index readers download stays smaller.
export const { staticGET: GET } = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
  buildIndex: (page) => ({
    id: page.url,
    url: page.url,
    title: page.data.title,
    description: page.data.description,
    structuredData: page.url.startsWith('/docs/archive')
      ? { headings: [], contents: [] }
      : page.data.structuredData,
  }),
});
