import { OpenAPIChainError } from './errors.js';
/** JSON.stringify can succeed without producing JSON (function, symbol, toJSON). */
export function stringifyJson(value: unknown, context: string): string {
  try {
    const result = JSON.stringify(value);
    if (result === undefined)
      throw new OpenAPIChainError('SERIALIZATION', 'Value has no JSON representation.');
    return result;
  } catch (cause) {
    throw new OpenAPIChainError('SERIALIZATION', `Cannot serialize JSON for ${context}.`, {
      cause,
    });
  }
}
