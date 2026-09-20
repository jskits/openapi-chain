/** Parameters describe a representation; they do not select its parser. */
export const mediaType = (value: string) => value.split(';', 1)[0]!.trim().toLowerCase();
export const isJsonMediaType = (value: string) =>
  value === 'application/json' || value.endsWith('+json');
