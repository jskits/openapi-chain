import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import {
  isBlob,
  isFormData,
  isUrlSearchParams,
  isArrayBuffer,
  isNativeBody,
  isFile,
} from '../packages/core/src/native-body.js';

test('platform brand checks reject toStringTag imitations', () => {
  expect(isBlob({ [Symbol.toStringTag]: 'Blob', size: 1 })).toBe(false);
  expect(isFormData({ [Symbol.toStringTag]: 'FormData' })).toBe(false);
  expect(isUrlSearchParams({ [Symbol.toStringTag]: 'URLSearchParams' })).toBe(false);
  expect(isArrayBuffer({ [Symbol.toStringTag]: 'ArrayBuffer', byteLength: 0 })).toBe(false);
  expect(isNativeBody(null)).toBe(false);
  expect(isFile(new Blob([]))).toBe(false);
});
test('native values and other-realm buffers retain their brands', () => {
  expect(isBlob(new Blob(['x']))).toBe(true);
  expect(isFile(new File(['x'], 'file.txt'))).toBe(true);
  expect(isFormData(new FormData())).toBe(true);
  expect(isUrlSearchParams(new URLSearchParams())).toBe(true);
  expect(isArrayBuffer(runInNewContext('new ArrayBuffer(2)'))).toBe(true);
  expect(isNativeBody(new Uint8Array([1]))).toBe(true);
});
