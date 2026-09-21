import { createCatalog } from '../examples/scoped/client.js';
const api = createCatalog('https://api.test');
void api.items.get();
void api.items('42').get();
void api.$path('/items').get();
// @ts-expect-error Unselected paths do not appear on the chain.
void api.admin.get();
// @ts-expect-error Exact template keys narrow to the same scope.
void api.$path('/admin').get();
// @ts-expect-error Path parameter typing survives scoping.
void api.items(42).get();
// @ts-expect-error Scoped queries remain operation-derived.
void api.items.get({ query: { unknown: 'x' } });
