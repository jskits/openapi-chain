export type QueryValue =
  | null
  | string
  | number
  | boolean
  | readonly QueryValue[]
  | { readonly [key: string]: QueryValue };
export type OperationQueryKey<Input> = readonly [...QueryValue[], Input];
export type QueryContext = { signal: AbortSignal | null };

// Snapshot inputs so later caller mutation cannot change the request behind a key.
// Reject values that JSON caches would silently drop or alias.
function snapshot(value: unknown, ancestors = new Set<object>()): QueryValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value;
  if (typeof value !== 'object' || value === null)
    throw new TypeError('Query keys and inputs must contain only finite JSON values.');
  if (ancestors.has(value)) throw new TypeError('Query keys and inputs must not contain cycles.');
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new TypeError('Query keys and inputs must use plain objects or arrays.');
  if (Object.getOwnPropertySymbols(value).length)
    throw new TypeError('Query keys and inputs must not contain symbol keys.');
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return Object.freeze(Array.from(value, (entry) => snapshot(entry, ancestors)));
    return Object.freeze(
      Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, snapshot((value as Record<string, unknown>)[key], ancestors)]),
      ),
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Define an explicit read operation. Use a non-secret server/account scope in key. */
export function createQuery<Input, Data>(options: {
  key: readonly QueryValue[];
  fetcher: (input: Input, context: QueryContext) => Promise<Data>;
}) {
  if (!Array.isArray(options.key) || options.key.length === 0)
    throw new TypeError('A nonempty operation query key is required.');
  const prefix = snapshot(options.key) as readonly QueryValue[];
  const fetcher = options.fetcher;
  const key = (input: Input): OperationQueryKey<Input> =>
    Object.freeze([...prefix, snapshot(input)]) as OperationQueryKey<Input>;
  const inputOf = (queryKey: OperationQueryKey<Input>) => queryKey[queryKey.length - 1] as Input;
  return {
    prefix,
    key,
    queryOptions(input: Input) {
      const queryKey = key(input);
      return {
        queryKey,
        queryFn: ({ signal }: { signal: AbortSignal }) => fetcher(inputOf(queryKey), { signal }),
      };
    },
    swr(input: Input | null) {
      return {
        key: input === null ? null : key(input),
        fetcher: (queryKey: OperationQueryKey<Input>) =>
          fetcher(inputOf(queryKey), { signal: null }),
      };
    },
  };
}
