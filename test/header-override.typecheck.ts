import type { OperationInputFor, OperationExtensionsFor } from '../src/index.js';

type Paths = {
  '/x': {
    parameters: {
      header: { 'X-Mode': string; 'X-Keep': string; 'X-Optional'?: boolean };
      query: { Q: string };
    };
    get: {
      parameters: { header: { 'x-mode': number }; query: { q: number } };
      responses: { 204: { content: never } };
    };
  };
};
type Input = OperationInputFor<Paths, '/x', 'get'>;
const input: Input = {
  header: { 'x-mode': 42, 'X-Keep': 'kept' },
  query: { Q: 'case-sensitive', q: 1 },
};
void input;
// @ts-expect-error operation header type replaces the differently cased path header
const wrong: Input = { header: { 'x-mode': 'wrong', 'X-Keep': 'kept' }, query: { Q: '', q: 1 } };
void wrong;
const extensions: OperationExtensionsFor<Paths, '/x', 'get'> = {
  header(value) {
    const mode: number = value['x-mode'];
    // @ts-expect-error the overridden path-level header is absent
    void value['X-Mode'];
    return { 'x-mode': String(mode), 'X-Keep': value['X-Keep'] };
  },
};
void extensions;
