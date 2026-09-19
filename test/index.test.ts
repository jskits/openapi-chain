import { expect, test } from 'vitest';

test('the library entry can be imported without application setup', async () => {
  const entry = await import('../src/index.js');
  expect(entry).toBeDefined();
});
