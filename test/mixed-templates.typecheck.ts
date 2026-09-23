import { createClient } from '../packages/core/src/index.js';
type Operation = {
  parameters: { path: { a: string; b: string } };
  get: { responses: { 204: { content: never } } };
};
const api = createClient<{
  '/adjacent/{a}{b}': Operation;
  '/prefix/x{a}': Operation;
  '/suffix/{a}.json': Operation;
}>({ baseUrl: 'https://example.test' });
// @ts-expect-error adjacent placeholders are not a single dynamic segment
void api.adjacent('ab').get();
// @ts-expect-error prefixed placeholders require the template escape
void api.prefix('ab').get();
// @ts-expect-error suffixed placeholders require the template escape
void api.suffix('ab').get();
void api.$path('/adjacent/{a}{b}', { a: 'a', b: 'b' }).get();
void api.$path('/prefix/x{a}', { a: 'a' }).get();
void api.$path('/suffix/{a}.json', { a: 'a' }).get();
