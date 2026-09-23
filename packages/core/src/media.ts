import { OpenAPIChainError } from './errors.js';
/** Parameters describe a representation; they do not select its parser. */
export const mediaType = (value: string) => value.split(';', 1)[0]!.trim().toLowerCase();
export const isJsonMediaType = (value: string) =>
  value === 'application/json' || value.endsWith('+json');

/** Fetch encodes generated strings as UTF-8, regardless of Content-Type. */
export function validateTextCharset(contentType: string): void {
  for (const [, name, value] of contentType
    .toLowerCase()
    .matchAll(/;\s*([^=;\s]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g)) {
    if (name === 'charset' && value!.trim().replace(/^"|"$|\\(.)/g, '$1') !== 'utf-8')
      throw new OpenAPIChainError('SERIALIZATION', 'Text charset not supported.');
  }
}
