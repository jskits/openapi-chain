import { createClient, type OperationInputFor } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import type { CompiledOpenAPIMetadata } from '../packages/core/src/metadata.js';

// Forwarding a value typed with OperationInputFor (for example from a query adapter fetcher)
// must compile for every request-body shape a generated schema can produce.
type NoContent = { 204: { content: never } };
type Paths = {
  '/none': { get: { requestBody?: never; responses: NoContent } };
  '/optional': {
    get: {
      requestBody?: { content: { 'application/x-www-form-urlencoded': { q?: string } } };
      responses: NoContent;
    };
  };
  '/single': {
    post: {
      requestBody: { content: { 'application/json': { name: string } } };
      responses: NoContent;
    };
  };
  '/multi': {
    post: {
      requestBody: {
        content: {
          'multipart/form-data': { file: string };
          'application/x-www-form-urlencoded': { name: string };
        };
      };
      responses: NoContent;
    };
  };
};
declare const metadata: CompiledOpenAPIMetadata;
const core = createClient<Paths>({ baseUrl: 'https://api.test' });
const strict = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata });

declare const coreNone: OperationInputFor<Paths, '/none', 'get'>;
declare const coreOptional: OperationInputFor<Paths, '/optional', 'get'>;
declare const coreSingle: OperationInputFor<Paths, '/single', 'post'>;
declare const coreMulti: OperationInputFor<Paths, '/multi', 'post'>;
void core.none.get(coreNone);
void core.optional.get(coreOptional);
void core.single.post(coreSingle);
void core.multi.post(coreMulti);

declare const strictNone: OperationInputFor<Paths, '/none', 'get', true>;
declare const strictOptional: OperationInputFor<Paths, '/optional', 'get', true>;
declare const strictSingle: OperationInputFor<Paths, '/single', 'post', true>;
declare const strictMulti: OperationInputFor<Paths, '/multi', 'post', true>;
void strict.none.get(strictNone);
void strict.optional.get(strictOptional);
void strict.single.post(strictSingle);
void strict.multi.post(strictMulti);

// Literal calls still take exactly the selected declaration's body.
void core.optional.get();
void core.optional.get({ contentType: 'application/x-www-form-urlencoded', body: { q: 'x' } });
// @ts-expect-error an optional body still follows its declaration when supplied
void core.optional.get({ contentType: 'application/x-www-form-urlencoded', body: { wrong: 1 } });
// @ts-expect-error each media type keeps its own body
void strict.multi.post({ contentType: 'multipart/form-data', body: { name: 'x' } });
