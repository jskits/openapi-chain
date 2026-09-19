import { expect, test } from 'vitest';
import { runExample } from '../examples/complete-client.js';

test('the generated-schema onboarding example runs in both modes', async () => {
  await expect(runExample()).resolves.toEqual({ name: 'Ada', message: 'not found' });
});
