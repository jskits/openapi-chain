import { join } from 'node:path';

/** Identical checked operations for full/scoped comparisons; only the exposed path set changes. */
export function typeFixture(root, routes, selected = routes, calls = 25, mode = 'core') {
  const strict = mode === 'strict';
  const suffix = strict ? '/query/{id}/' : '/{id}';
  const segment = strict ? '.query' : '';
  const factory = strict ? 'createStrictClient' : 'createClient';
  const entries = Array.from(
    { length: routes },
    (_, i) => `'/r${i}${suffix}': {
    parameters: { path: { id: string } };
    get: { parameters: { query: { q: string } }; responses: { 200: { content: { 'application/json': { ok: true } } } } };
  };`,
  ).join('\n');
  const keys = Array.from({ length: selected }, (_, i) => `'/r${i}${suffix}'`).join(' | ');
  const uses = Array.from(
    { length: calls },
    (_, i) =>
      `const result${i}: Promise<{ok:true}> = api.r${i}${segment}('id').get({ query: { q: 'x' } }); void result${i};`,
  ).join('\n');
  return `// edit: a
import { ${factory}${strict ? ', type CompiledOpenAPIMetadata' : ''} } from ${JSON.stringify(join(root, strict ? 'packages/core/dist/strict.js' : 'packages/core/dist/index.js').replaceAll('\\', '/'))};
type AllPaths = {${entries}};
type Paths = ${selected === routes ? 'AllPaths' : `Pick<AllPaths, ${keys}>`};
const api = ${factory}<Paths>({ baseUrl: 'https://example.test'${strict ? ', metadata: {} as CompiledOpenAPIMetadata' : ''} });
${uses}
// @ts-expect-error required query survives scoping
api.r0${segment}('id').get();
// @ts-expect-error path argument type survives scoping
api.r0${segment}(1);
${selected < routes ? '// @ts-expect-error unselected endpoint is absent\napi.r' + selected + segment + "('id').get({query:{q:'x'}});" : ''}
`;
}
