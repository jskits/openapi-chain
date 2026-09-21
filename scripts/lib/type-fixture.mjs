import { join } from 'node:path';

/** Identical checked operations for full/scoped comparisons; only the exposed path set changes. */
export function typeFixture(root, routes, selected = routes, calls = 25) {
  const entries = Array.from(
    { length: routes },
    (_, i) => `'/r${i}/{id}': {
    parameters: { path: { id: string } };
    get: { parameters: { query: { q: string } }; responses: { 200: { content: { 'application/json': { ok: true } } } } };
  };`,
  ).join('\n');
  const keys = Array.from({ length: selected }, (_, i) => `'/r${i}/{id}'`).join(' | ');
  const uses = Array.from(
    { length: calls },
    (_, i) =>
      `const result${i}: Promise<{ok:true}> = api.r${i}('id').get({ query: { q: 'x' } }); void result${i};`,
  ).join('\n');
  return `// edit: a
import { createClient } from ${JSON.stringify(join(root, 'dist/index.js').replaceAll('\\', '/'))};
type AllPaths = {${entries}};
type Paths = ${selected === routes ? 'AllPaths' : `Pick<AllPaths, ${keys}>`};
const api = createClient<Paths>({ baseUrl: 'https://example.test' });
${uses}
// @ts-expect-error required query survives scoping
api.r0('id').get();
// @ts-expect-error path argument type survives scoping
api.r0(1);
${selected < routes ? '// @ts-expect-error unselected endpoint is absent\napi.r' + selected + "('id').get({query:{q:'x'}});" : ''}
`;
}
