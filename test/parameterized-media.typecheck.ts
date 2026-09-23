import { createClient } from '../src/index.js';
import { createStrictClient } from '../src/strict.js';
import type { CompiledOpenAPIMetadata } from '../src/metadata.js';

type Paths = {
  '/profile': {
    post: {
      requestBody: { content: { 'application/*; profile=v1': { value: string } } };
      responses: { 204: { content: never } };
    };
  };
  '/any': {
    post: {
      requestBody: { content: { '*/*; version=1': string } };
      responses: { 204: { content: never } };
    };
  };
  '/concrete': {
    post: {
      requestBody: { content: { 'application/json; profile="*"': { value: string } } };
      responses: { 204: { content: never } };
    };
  };
};
declare const metadata: CompiledOpenAPIMetadata;
const core = createClient<Paths>({ baseUrl: 'https://api.test' });
const strict = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata });

void core.profile.post({ body: { value: 'x' }, contentType: 'application/json; profile=v1' });
void strict.profile.post({ body: { value: 'x' }, contentType: 'application/json; profile=v1' });
void core.any.post({ body: 'x', contentType: 'text/plain; version=1' });
void strict.any.post({ body: 'x', contentType: 'text/plain; version=1' });
// A wildcard in a parameter value does not make the media essence a range.
void strict.concrete.post({ body: { value: 'x' } });

// @ts-expect-error a parameterized wildcard still needs a concrete request media type
void strict.profile.post({ body: { value: 'x' } });
// @ts-expect-error the parameterized full wildcard cannot be inferred either
void strict.any.post({ body: 'x' });
// @ts-expect-error the required representation parameter must remain present
void core.profile.post({ body: { value: 'x' }, contentType: 'application/json' });
// @ts-expect-error a different profile is not the declared representation
void strict.profile.post({ body: { value: 'x' }, contentType: 'application/json; profile=v2' });
// @ts-expect-error the actual header must not retain the wildcard
void strict.profile.post({ body: { value: 'x' }, contentType: 'application/*; profile=v1' });
// @ts-expect-error keep request data correlated with the selected operation
void core.profile.post({ body: 'x', contentType: 'application/json; profile=v1' });
