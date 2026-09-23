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

function chainShape(state: Extract<ProxyState, { kind: 'chain' }>) {
  return state.segments.map((segment) => (segment.kind === 'dynamic' ? null : segment.value));
}

function chainKey(state: Extract<ProxyState, { kind: 'chain' }>, method: HttpMethod) {
  return JSON.stringify([method, ...chainShape(state)]);
}

/** Snapshot the routing structure once; requests only inspect their own path depth. */
export function createOperationResolver(metadata: OpenAPIMetadata | undefined) {
  const direct = new Map<string, Partial<Record<HttpMethod, OperationMetadata>>>();
  const chains = new Map<string, ResolvedOperation[]>();
  const methodSegments = new Set<string>();
  const complete = metadata?.complete === true;
  for (const [template, methods] of Object.entries(metadata?.operations ?? {})) {
    direct.set(template, { ...methods });
    // These paths cannot be represented losslessly by a property chain.
    if (template !== '/' && (template.endsWith('//') || template.startsWith('//'))) continue;
    const shape = splitPath(template).map((segment) =>
      /^\{[^{}]+\}$/.test(segment) ? null : segment,
    );
    for (let index = 0; index < shape.length; index++) {
      if (httpMethods.includes(shape[index] as HttpMethod))
        methodSegments.add(JSON.stringify(shape.slice(0, index + 1)));
    }
    for (const method of httpMethods) {
      const operation = methods[method];
      if (operation === undefined) continue;
      const key = JSON.stringify([method, ...shape]);
      const matches = chains.get(key) ?? [];
      matches.push({ template, metadata: operation });
      chains.set(key, matches);
    }
  }
  const resolve = (state: ProxyState, method: HttpMethod): ResolvedOperation => {
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
    const key = chainKey(state, method);
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
  return Object.assign(resolve, {
    // Ambiguous methods still occupy the node: calling one fails in resolve().
    // Incomplete/legacy metadata cannot prove absence, so retain method priority.
    usesMethod: (state: Extract<ProxyState, { kind: 'chain' }>, method: HttpMethod) =>
      !complete ||
      chains.has(chainKey(state, method)) ||
      !methodSegments.has(JSON.stringify([...chainShape(state), method])),
  });
}
