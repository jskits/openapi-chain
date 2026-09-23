import { expect, test } from 'vitest';
import { compileOpenAPIMetadata } from '../src/metadata.js';

const compile = (operation: unknown) =>
  compileOpenAPIMetadata({ openapi: '3.2.0', paths: { '/x': { post: operation } } });
test.each(['true', 1, null])('rejects nonboolean required %j', (required) => {
  expect(() => compile({ parameters: [{ name: 'q', in: 'query', schema: {}, required }] })).toThrow(
    /required must be boolean/,
  );
  expect(() => compile({ requestBody: { content: {}, required } })).toThrow(
    /required must be boolean/,
  );
});
test.each([undefined, null, [], 'bad'])('requires a request body content record %j', (content) => {
  expect(() => compile({ requestBody: { content } })).toThrow(
    /requestBody.content must be an object/,
  );
});
test.each([undefined, null, [], 'bad'])('rejects malformed media objects %j', (media) => {
  expect(() => compile({ requestBody: { content: { 'application/json': media } } })).toThrow(
    /Media Type Object/,
  );
});
test.each([null, [], 'bad'])('validates encoding headers %j', (headers) => {
  expect(() =>
    compile({
      requestBody: { content: { 'multipart/form-data': { encoding: { x: { headers } } } } },
    }),
  ).toThrow(/encoding.headers/);
});
test('retains valid optional bodies and empty content maps', () => {
  expect(
    compile({ requestBody: { required: false, content: {} } }).operations['/x']!.post!.requestBody,
  ).toEqual({ mediaTypes: [] });
});
