/** Accept ordinary records, including null-prototype and other-realm records. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return (
    prototype === null ||
    (Object.getPrototypeOf(prototype) === null &&
      Object.hasOwn(prototype, 'constructor') &&
      (prototype as { constructor?: { name?: string } }).constructor?.name === 'Object')
  );
}
