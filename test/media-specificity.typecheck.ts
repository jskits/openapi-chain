import { createClient, type OperationInputFor } from '../packages/core/src/index.js';
import { createStrictClient } from '../packages/core/src/strict.js';
import type { CompiledOpenAPIMetadata } from '../packages/core/src/metadata.js';

type NoContent = { 204: { content: never } };
type Paths = {
  '/typed': {
    post: {
      requestBody: {
        content: { 'application/*': { fallback: string }; 'application/json': { exact: number } };
      };
      responses: NoContent;
    };
  };
  '/layered': {
    post: {
      requestBody: {
        content: { '*/*': string; 'text/*': { text: true }; 'text/plain': { plain: true } };
      };
      responses: NoContent;
    };
  };
  '/profiled': {
    post: {
      requestBody: {
        content: {
          'application/*': { fallback: string };
          'application/json; profile=v1': { v1: true };
        };
      };
      responses: NoContent;
    };
  };
};
type Normalized = {
  '/any': {
    post: {
      requestBody: { content: { '*/*': string; 'application/json': { exact: number } } };
      responses: NoContent;
    };
  };
  '/charset': {
    post: {
      requestBody: {
        content: { 'text/*': { generic: true }; 'text/*; charset=utf-8': { utf8: true } };
      };
      responses: NoContent;
    };
  };
};
declare const metadata: CompiledOpenAPIMetadata;
const core = createClient<Paths>({ baseUrl: 'https://api.test' });
const strict = createStrictClient<Paths>({ baseUrl: 'https://api.test', metadata });

// The most specific declaration applies, exactly as the runtime selects it.
void core.typed.post({ contentType: 'application/json', body: { exact: 1 } });
void strict.typed.post({ contentType: 'application/json', body: { exact: 1 } });
void core.typed.post({ contentType: 'application/xml', body: { fallback: 'x' } });
void strict.typed.post({ contentType: 'application/xml', body: { fallback: 'x' } });
void core.layered.post({ contentType: 'text/plain', body: { plain: true } });
void core.layered.post({ contentType: 'text/html', body: { text: true } });
void core.layered.post({ contentType: 'image/png', body: 'x' });
void core.profiled.post({ contentType: 'application/json; profile=v1', body: { v1: true } });
void core.profiled.post({ contentType: 'application/json', body: { fallback: 'x' } });

// @ts-expect-error application/json selects the exact declaration, not the wildcard
void core.typed.post({ contentType: 'application/json', body: { fallback: 'wrong branch' } });
// @ts-expect-error strict selects the same declaration
void strict.typed.post({ contentType: 'application/json', body: { fallback: 'wrong branch' } });
// @ts-expect-error the exact body is not valid for another application subtype
void core.typed.post({ contentType: 'application/xml', body: { exact: 1 } });
// @ts-expect-error text/plain selects the exact declaration over text/*
void core.layered.post({ contentType: 'text/plain', body: { text: true } });
// @ts-expect-error text/plain selects the exact declaration over */*
void strict.layered.post({ contentType: 'text/plain', body: 'x' });
// @ts-expect-error text/html selects text/* over */*
void core.layered.post({ contentType: 'text/html', body: 'x' });
// @ts-expect-error the parameterized declaration is more specific than application/*
void core.profiled.post({ contentType: 'application/json; profile=v1', body: { fallback: 'x' } });

const input = {
  contentType: 'application/json',
  body: { fallback: 'wrong branch' },
} as const satisfies OperationInputFor<Paths, '/typed', 'post'>;
// @ts-expect-error named inputs are checked at the operation boundary as well
void core.typed.post(input);

// Forwarding an already-typed operation input keeps working for every declared variant.
declare const forwarded: OperationInputFor<Paths, '/typed', 'post'>;
void core.typed.post(forwarded);
void strict.typed.post(forwarded);
declare const layered: OperationInputFor<Paths, '/layered', 'post'>;
void core.layered.post(layered);

// Runtime matching ignores representation parameters on exact declarations and normalizes
// case, whitespace and quoting. A spelling the runtime assigns to a more specific
// declaration must never be typed with a broader declaration's body.
const normalized = createClient<Normalized>({ baseUrl: 'https://api.test' });
// @ts-expect-error runtime selects application/json for a parameterized spelling
void core.typed.post({ contentType: 'application/json; charset=utf-8', body: { fallback: 'x' } });
// @ts-expect-error strict applies the same selection
void strict.typed.post({ contentType: 'application/json; charset=utf-8', body: { fallback: 'x' } });
// @ts-expect-error parameter whitespace does not change the selected declaration
void core.profiled.post({ contentType: 'application/json;profile=v1', body: { fallback: 'x' } });
// @ts-expect-error parameter names are case-insensitive and values may be quoted
void core.profiled.post({ contentType: 'application/json; PROFILE="v1"', body: { fallback: 'x' } });
// @ts-expect-error media essences are case-insensitive
void normalized.any.post({ contentType: 'APPLICATION/JSON', body: 'x' });
// A different parameter value does not match the parameterized declaration.
void core.profiled.post({ contentType: 'application/json; profile=v2', body: { fallback: 'x' } });
// The declaration with more matching parameters wins within the same range.
void normalized.charset.post({ contentType: 'text/plain; charset=utf-8', body: { utf8: true } });
void normalized.charset.post({ contentType: 'text/plain', body: { generic: true } });
// @ts-expect-error text/*; charset=utf-8 applies to a UTF-8 text body
void normalized.charset.post({ contentType: 'text/plain; charset=utf-8', body: { generic: true } });
