/* oxlint-disable typescript/unbound-method -- Brand checks intentionally borrow platform methods and bind the candidate through Reflect.apply. */
// Borrow platform brand checks instead of relying on realm-local constructors.
function branded(value: unknown, probe: (...args: never[]) => unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  try {
    Reflect.apply(probe, value, ['']);
    return true;
  } catch {
    return false;
  }
}
const blobSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
const bufferSize = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
export const isBlob = (value: unknown): value is Blob => branded(value, blobSize);
export const isFormData = (value: unknown): value is FormData =>
  branded(value, FormData.prototype.has);
export const isUrlSearchParams = (value: unknown): value is URLSearchParams =>
  branded(value, URLSearchParams.prototype.has);
export const isArrayBuffer = (value: unknown): value is ArrayBuffer => branded(value, bufferSize);
export function isFile(value: unknown): value is File {
  return (
    typeof File !== 'undefined' &&
    branded(value, Object.getOwnPropertyDescriptor(File.prototype, 'name')!.get!)
  );
}
export const isNativeBody = (value: unknown): value is BodyInit =>
  typeof value === 'string' ||
  isBlob(value) ||
  isFormData(value) ||
  isUrlSearchParams(value) ||
  isArrayBuffer(value) ||
  ArrayBuffer.isView(value);
