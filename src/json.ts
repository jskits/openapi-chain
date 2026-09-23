/** JSON.stringify can succeed without producing JSON (function, symbol, toJSON). */
export function stringifyJson(value: unknown, context: string): string {
  try {
    const result = JSON.stringify(value);
    if (result === undefined) throw new TypeError('Value has no JSON representation.');
    return result;
  } catch (cause) {
    throw new TypeError(`Cannot serialize JSON for ${context}.`, { cause });
  }
}
