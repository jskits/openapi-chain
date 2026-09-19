import { httpMethods } from './constant.js';
import type { HttpMethod, OpenAPIMetadata, OperationMetadata } from './type.js';

export type ChainSegment = { kind: 'static'; value: unknown } | { kind: 'dynamic'; value: unknown };
export type ProxyState =
  | { kind: 'chain'; segments: readonly ChainSegment[] }
  | { kind: 'template'; template: string; params: Record<string, unknown> | undefined };
export type ResolvedOperation = { template?: string; metadata?: OperationMetadata | undefined };

export function splitPath(path: string): string[] {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  return normalized ? normalized.split('/') : [];
}

/** Snapshot the routing structure once; requests only inspect their own path depth. */
export function createOperationResolver(metadata: OpenAPIMetadata | undefined) {
  const direct = new Map<string, Partial<Record<HttpMethod, OperationMetadata>>>();
  const chains = new Map<string, ResolvedOperation[]>();
  const complete = metadata?.complete === true;
  for (const [template, methods] of Object.entries(metadata?.operations ?? {})) {
    direct.set(template, { ...methods });
    const shape = splitPath(template).map((segment) =>
      /^\{[^{}]+\}$/.test(segment) ? null : segment,
    );
    for (const method of httpMethods) {
      const operation = methods[method];
      if (operation === undefined) continue;
      const key = JSON.stringify([method, ...shape]);
      const matches = chains.get(key) ?? [];
      matches.push({ template, metadata: operation });
      chains.set(key, matches);
    }
  }
  return (state: ProxyState, method: HttpMethod): ResolvedOperation => {
    if (!metadata) return {};
    if (state.kind === 'template') {
      const operation = direct.get(state.template)?.[method];
      if (!operation && complete) {
        throw new TypeError(
          `Compiled OpenAPI metadata does not contain ${method.toUpperCase()} ${state.template}.`,
        );
      }
      return { template: state.template, metadata: operation };
    }
    const key = JSON.stringify([
      method,
      ...state.segments.map((segment) => (segment.kind === 'dynamic' ? null : segment.value)),
    ]);
    const matches = chains.get(key);
    if (matches && matches.length > 1) {
      throw new TypeError(
        `Ambiguous OpenAPI runtime metadata for ${method.toUpperCase()} chain path.`,
      );
    }
    if (matches?.length) return matches[0]!;
    if (complete)
      throw new TypeError(
        `Compiled OpenAPI metadata does not match the ${method.toUpperCase()} chain path.`,
      );
    return {};
  };
}
