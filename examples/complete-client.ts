import document from './service.openapi.json' with { type: 'json' };
import type { paths } from './service-schema.js';
import {
  createClient,
  type OperationExtensionsFor,
  type Transport,
} from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import { compileOpenAPIMetadata } from '../packages/core/src/metadata.js';

const validateResponse = {
  response: async (response: Response) => {
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new TypeError('Expected JSON object');
    if (
      response.status === 200 &&
      'id' in data &&
      typeof data.id === 'string' &&
      'name' in data &&
      typeof data.name === 'string'
    ) {
      return { status: 200, data: { id: data.id, name: data.name } };
    }
    if (response.status === 404 && 'error' in data && typeof data.error === 'string') {
      return { status: 404, data: { error: data.error } };
    }
    throw new TypeError('Undocumented status or invalid response data');
  },
} satisfies OperationExtensionsFor<paths, '/items/{id}', 'get'>;

// A deterministic demo transport. Omit this option to use native Fetch instead.
const transport: Transport = async (request) => {
  const missing = new URL(request.url).pathname.endsWith('/missing');
  return new Response(
    JSON.stringify(missing ? { error: 'not found' } : { id: '42', name: 'Ada' }),
    { status: missing ? 404 : 200, headers: { 'content-type': 'application/json' } },
  );
};

export async function runExample() {
  const core = createClient<paths>({ baseUrl: 'https://example.test', transport });
  const item = await core.items('42').get({ extensions: validateResponse });
  const metadata = compileOpenAPIMetadata(document);
  const strict = createStrictClient<paths>({
    baseUrl: 'https://example.test',
    metadata,
    transport,
    throwOnError: false,
  });
  const result = await strict.items('missing').get({ extensions: validateResponse });
  // HTTP errors use the result union. Network/abort/validation failures still reject.
  return { name: item.name, message: result.ok ? result.data.name : result.data.error };
}
