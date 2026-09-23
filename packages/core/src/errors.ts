export type OpenAPIChainErrorCode =
  | 'UNSAFE_PATH'
  | 'METADATA_COMPILE'
  | 'METADATA_MISMATCH'
  | 'SERIALIZATION'
  | 'EXTENSION_CONTRACT';

/** Stable library contract failures; still compatible with TypeError handlers. */
export class OpenAPIChainError extends TypeError {
  declare method?: string;
  declare pathTemplate?: string;
  constructor(
    readonly code: OpenAPIChainErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OpenAPIChainError';
  }
}

export function operationError(error: unknown, method: string, pathTemplate: string): unknown {
  if (error instanceof OpenAPIChainError) {
    error.method ??= method.toUpperCase();
    error.pathTemplate ??= pathTemplate;
  }
  return error;
}
