import { createClient } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import document from './fixtures/conformance.openapi.json' with { type: 'json' };
import type { paths } from './fixtures/conformance-schema.js';
const core = createClient<paths>({ baseUrl: 'https://example.test' });
const strict = createStrictClient<paths>({
  baseUrl: 'https://example.test',
  metadata: compileOpenAPIMetadata(document),
});
for (const api of [core, strict]) {
  void api.$path('/echo/{id}', { id: 'a/b' }).get();
  void api.$path('/reports/{year}-{month}', { year: 2026, month: 9 }).get();
  // @ts-expect-error mixed templates do not expose a callable chain
  void api.reports('not-two-integers').get();
  // @ts-expect-error template arguments retain generated integer types
  void api.$path('/reports/{year}-{month}', { year: '2026', month: 9 }).get();
  void api.$path('/echo/{id}/', { id: 'a/b' }).get();
  // @ts-expect-error generated path parameter stays required
  void api.$path('/echo/{id}/').get();
  // @ts-expect-error generated query parameter stays required
  void api.search.get();
  // @ts-expect-error generated scalar type is preserved
  void api.echo(1).get();
}
void strict.upload.post({ body: { value: 'hello' } });
// @ts-expect-error composed generated property remains string
void strict.upload.post({ body: { value: 42 } });
// @ts-expect-error core has no runtime media inference
void core.upload.post({ body: { value: 'hello' } });
