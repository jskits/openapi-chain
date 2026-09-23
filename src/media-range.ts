import { OpenAPIChainError } from './errors.js';
import { mediaType } from './media.js';

/** Preserve representation parameters when selecting an OpenAPI media declaration. */
export function parseMediaRange(value: string): { type: string; parameters: Map<string, string> } {
  const type = mediaType(value);
  if (
    !/^[!#$%&'*+.^_`|~\w-]+\/[!#$%&'*+.^_`|~\w-]+$/.test(type) ||
    (type.startsWith('*/') && type !== '*/*')
  )
    throw new OpenAPIChainError('SERIALIZATION', `Invalid media type: ${value}`);
  const parameters = new Map<string, string>();
  let rest = value.includes(';') ? value.slice(value.indexOf(';')) : '';
  while (rest) {
    const match =
      /^\s*;\s*([!#$%&'*+.^_`|~\w-]+)\s*=\s*("(?:[^"\\\r\n]|\\[^\r\n])*"|[!#$%&'*+.^_`|~\w-]+)\s*/.exec(
        rest,
      );
    if (!match) throw new OpenAPIChainError('SERIALIZATION', `Invalid media parameters: ${value}`);
    const name = match[1]!.toLowerCase();
    let parameter = match[2]!;
    if (parameter.startsWith('"')) parameter = parameter.slice(1, -1).replace(/\\(.)/g, '$1');
    if (name === 'charset') parameter = parameter.toLowerCase();
    if (parameters.has(name))
      throw new OpenAPIChainError('SERIALIZATION', `Duplicate media parameter ${name}: ${value}`);
    parameters.set(name, parameter);
    rest = rest.slice(match[0].length);
  }
  return { type, parameters };
}

/** Encoding contentType is a list; quoted parameter commas are not separators. */
export function splitMediaRanges(value: string): string[] {
  const ranges: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (escaped) escaped = false;
    else if (quoted && char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') {
      ranges.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  ranges.push(value.slice(start).trim());
  for (const range of ranges) parseMediaRange(range);
  return ranges;
}

export function mediaRangeMatches(range: string, actual: string): boolean {
  const expected = parseMediaRange(range);
  const value = parseMediaRange(actual);
  return (
    (expected.type === value.type ||
      expected.type === '*/*' ||
      (expected.type.endsWith('/*') && value.type.startsWith(expected.type.slice(0, -1)))) &&
    [...expected.parameters].every(([name, parameter]) => value.parameters.get(name) === parameter)
  );
}

export function selectMediaDeclaration(
  declarations: readonly string[],
  actual: string,
): string | undefined {
  const candidates = [...new Set(declarations)].filter((range) => mediaRangeMatches(range, actual));
  const specificity = (range: string) => {
    const parsed = parseMediaRange(range);
    return [
      parsed.type === '*/*' ? 0 : parsed.type.endsWith('/*') ? 1 : 2,
      parsed.parameters.size,
    ] as const;
  };
  candidates.sort((a, b) => {
    const left = specificity(a),
      right = specificity(b);
    return right[0] - left[0] || right[1] - left[1];
  });
  if (candidates.length > 1) {
    const first = specificity(candidates[0]!),
      second = specificity(candidates[1]!);
    if (first[0] === second[0] && first[1] === second[1])
      throw new OpenAPIChainError('SERIALIZATION', `Ambiguous media declarations for ${actual}.`);
  }
  return candidates[0];
}
