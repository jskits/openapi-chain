import { createClient } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import { compileOpenAPIMetadata } from '../src/metadata.js';
import type { paths } from '../examples/schema.js';

const core = createClient<paths>({ baseUrl: 'https://example.test' });
const strict = createStrictClient<paths>({
  baseUrl: 'https://example.test',
  metadata: compileOpenAPIMetadata({ openapi: '3.1.0', paths: {} }),
});
for (const api of [core, strict]) {
  void api.pet(1).get();
  void api.pet.findByStatus.get({ query: { status: 'available' } });
  void api.pet(1).get({ init: { signal: new AbortController().signal } });
  void api.pet.post({ contentType: 'application/json', body: { name: 'dog', photoUrls: [] } });
  // @ts-expect-error generated numeric path parameters reject strings
  void api.pet('wrong').get();
  // @ts-expect-error generated enum values remain constrained
  void api.pet.findByStatus.get({ query: { status: 'wrong' } });
  // @ts-expect-error required body properties remain required
  void api.pet.post({ contentType: 'application/json', body: {} });
}
