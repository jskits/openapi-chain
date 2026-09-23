import type { httpMethods } from './constant.js';

export type HttpMethod = (typeof httpMethods)[number];
export type OpenAPIPaths = object;
export type PathValue = string | number | boolean;

export type ParameterLocation = 'path' | 'query' | 'querystring' | 'header' | 'cookie';
export type ParameterStyle =
  | 'simple'
  | 'label'
  | 'matrix'
  | 'form'
  | 'spaceDelimited'
  | 'pipeDelimited'
  | 'deepObject'
  | 'cookie';

export type ParameterMetadata = {
  name: string;
  in: ParameterLocation;
  required?: boolean;
  style: ParameterStyle;
  explode: boolean;
  allowReserved?: boolean;
  contentType?: string;
  /** Media metadata used by OAS 3.2 querystring content. */
  media?: MediaTypeMetadata;
};

export type EncodingMetadata = {
  contentType?: string;
  style?: ParameterStyle;
  explode?: boolean;
  allowReserved?: boolean;
  /** True when style/explode/allowReserved explicitly selects RFC6570-style encoding. */
  styleBased?: boolean;
  hasHeaders?: boolean;
  /** Advanced OAS 3.2 encoding features that require whole-body custom serialization. */
  requiresCustomSerializer?: string;
};

export type MediaTypeMetadata = {
  encoding?: Readonly<Record<string, EncodingMetadata>>;
  propertyKinds?: Readonly<Record<string, 'primitive' | 'object' | 'array' | 'binary' | 'unknown'>>;
  /** Default Encoding Object contentType for each request-body property. */
  propertyContentTypes?: Readonly<Record<string, string>>;
  /** A serialization requirement that built-in serializers cannot satisfy. */
  requiresCustomSerializer?: string;
  /** Limit that requirement to actual multipart or URL-encoded media; omitted means all media. */
  customSerializerScope?: 'form';
};

export type RequestBodyMetadata = {
  mediaTypes: readonly string[];
  required?: boolean;
  media?: Readonly<Record<string, MediaTypeMetadata>>;
};

export type OperationMetadata = {
  parameters?: Partial<Record<ParameterLocation, Readonly<Record<string, ParameterMetadata>>>>;
  requestBody?: RequestBodyMetadata;
};

export type OpenAPIMetadata = {
  version: 1;
  complete?: boolean;
  operations: Readonly<Record<string, Partial<Record<HttpMethod, OperationMetadata>>>>;
};

declare const compiledOpenAPIMetadataBrand: unique symbol;
export type CompiledOpenAPIMetadata = OpenAPIMetadata & {
  readonly complete: true;
  readonly [compiledOpenAPIMetadataBrand]: true;
};

export type RequestInput = {
  query?: Record<string, unknown>;
  querystring?: Record<string, unknown>;
  header?: Record<string, unknown>;
  cookie?: Record<string, unknown>;
  body?: unknown;
  contentType?: string;
  init?: Omit<RequestInit, 'method' | 'body' | 'headers'> & {
    headers?: HeadersInit;
  };
  /** Runtime shape of the operation-derived extensions exposed by OperationInput. */
  extensions?: object;
};

export type TransportRequest = {
  url: string;
  method: HttpMethod;
  init: RequestInit;
};

export type Transport = (request: TransportRequest) => Promise<Response>;
export type Middleware = (request: TransportRequest, next: Transport) => Promise<Response>;

/** Internal strict-runtime body serialization hook. */
export type RequestBodySerializer = (input: {
  body: unknown;
  contentType: string;
  operation?: OperationMetadata;
}) => BodyInit | undefined;

export type ParameterContentSerializer = (input: {
  value: unknown;
  contentType: string;
  parameter: ParameterMetadata;
}) => string;

export type ClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  transport?: Transport;
  middleware?: readonly Middleware[];
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  metadata?: OpenAPIMetadata;
  throwOnError?: boolean;
};

/** Options accepted by the tiny schema-free core entry point. */
export type CoreClientOptions = Omit<ClientOptions, 'metadata' | 'middleware' | 'headers'> & {
  metadata?: never;
  middleware?: never;
  headers?: HeadersInit;
};

/** Options accepted by the exact-wire `./strict` entry point. */
export type StrictClientOptions = Omit<ClientOptions, 'metadata'> & {
  metadata: CompiledOpenAPIMetadata;
};

export class HttpError<T = unknown> extends Error {
  readonly status: number;
  readonly data: T;
  readonly response: Response;

  constructor(message: string, response: Response, data: T) {
    super(message);
    this.name = 'HttpError';
    this.status = response.status;
    this.data = data;
    this.response = response;
  }
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type StringKeyOf<T> = Extract<keyof T, string>;
type Defined<T> = Exclude<T, undefined | null>;
type ValueOf<T> = T[keyof T];
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;

type SplitSegments<S extends string> = S extends ''
  ? []
  : S extends `${infer Head}/${infer Tail}`
    ? Tail extends ''
      ? [Head, '']
      : [Head, ...SplitSegments<Tail>]
    : [S];

type RemoveLeadingSlash<S extends string> = S extends `/${infer Rest}`
  ? RemoveLeadingSlash<Rest>
  : S;

type OperationEntryForPath<
  Path extends string,
  Item,
  MetadataRouting extends boolean = false,
> = Item extends object
  ? {
      [Method in Extract<keyof Item, HttpMethod>]: [Defined<Item[Method]>] extends [never]
        ? never
        : {
            path: Path;
            item: Item;
            operation: Defined<Item[Method]>;
            method: Method;
            segments: Path extends `//${string}`
              ? ['']
              : SplitSegments<
                  RemoveLeadingSlash<
                    MetadataRouting extends true
                      ? Path extends `${infer Base}/`
                        ? Base
                        : Path
                      : Path
                  >
                >;
          };
    }[Extract<keyof Item, HttpMethod>]
  : never;

type OperationEntries<Paths extends OpenAPIPaths, MetadataRouting extends boolean = false> = {
  [Path in StringKeyOf<Paths>]: OperationEntryForPath<Path, Paths[Path], MetadataRouting>;
}[StringKeyOf<Paths>];

type FirstSegment<E> = E extends {
  segments: [infer Head extends string, ...string[]];
}
  ? Head
  : never;

type Advance<E, Segment extends string> = E extends {
  path: infer Path extends string;
  item: infer Item;
  operation: infer Operation;
  method: infer Method extends HttpMethod;
  segments: [infer Head extends string, ...infer Tail extends string[]];
}
  ? Head extends Segment
    ? {
        path: Path;
        item: Item;
        operation: Operation;
        method: Method;
        segments: Tail;
      }
    : never
  : never;

type IsExactTemplate<S extends string> = S extends `{${infer Name}}`
  ? Name extends ''
    ? false
    : Name extends `${string}{${string}` | `${string}}${string}`
      ? false
      : true
  : false;

type TemplateEntries<E> = E extends {
  segments: [infer Head extends string, ...string[]];
}
  ? IsExactTemplate<Head> extends true
    ? E
    : never
  : never;

type AdvanceTemplates<E> = E extends {
  path: infer Path extends string;
  item: infer Item;
  operation: infer Operation;
  method: infer Method extends HttpMethod;
  segments: [infer Head extends string, ...infer Tail extends string[]];
}
  ? IsExactTemplate<Head> extends true
    ? {
        path: Path;
        item: Item;
        operation: Operation;
        method: Method;
        segments: Tail;
      }
    : never
  : never;

type LeafEntries<E> = E extends { segments: [] } ? E : never;

type ReservedSegment = HttpMethod | '$path' | 'then';

type IsSafeStaticSegment<S extends string, Reserved extends string = ReservedSegment> = S extends ''
  ? false
  : S extends Reserved
    ? false
    : S extends `${string}{${string}` | `${string}}${string}`
      ? false
      : true;

type ParametersOf<T> = 'parameters' extends keyof T
  ? T extends { parameters?: infer P }
    ? Defined<P>
    : {}
  : {};

type ParameterLocationRecord<Params, Location extends PropertyKey> = Location extends keyof Params
  ? Defined<Params[Location]>
  : {};

type PresentRecord<T> = [T] extends [never] ? {} : T;

type OverriddenKeys<Base, Override, IgnoreCase extends boolean> = IgnoreCase extends true
  ? {
      [Key in keyof Base]: Key extends string
        ? Lowercase<Key> extends Lowercase<Extract<keyof Override, string>>
          ? Key
          : never
        : Key extends keyof Override
          ? Key
          : never;
    }[keyof Base]
  : keyof Override;

type MergeRecords<Base, Override, IgnoreCase extends boolean = false> = Base extends object
  ? Override extends object
    ? Simplify<Omit<Base, OverriddenKeys<Base, Override, IgnoreCase>> & Override>
    : Base
  : Override extends object
    ? Override
    : {};

type LocationParameters<Item, Operation, Location extends PropertyKey> = MergeRecords<
  PresentRecord<ParameterLocationRecord<ParametersOf<Item>, Location>>,
  PresentRecord<ParameterLocationRecord<ParametersOf<Operation>, Location>>,
  Location extends 'header' ? true : false
>;

type RequiredKeys<T> = T extends object
  ? {
      [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
    }[keyof T]
  : never;

type HasRequiredKeys<T> = [RequiredKeys<T>] extends [never] ? false : true;

type LocationField<Name extends string, T> = T extends object
  ? keyof T extends never
    ? { [K in Name]?: never }
    : HasRequiredKeys<T> extends true
      ? { [K in Name]: T }
      : { [K in Name]?: T }
  : { [K in Name]?: never };

type QuerystringField<Item, Operation, InferRuntimeMetadata extends boolean> =
  LocationParameters<Item, Operation, 'querystring'> extends infer Params
    ? Params extends object
      ? keyof Params extends never
        ? {}
        : InferRuntimeMetadata extends true
          ? LocationField<'querystring', Params>
          : HasRequiredKeys<Params> extends true
            ? { querystring: never }
            : { querystring?: never }
      : {}
    : {};

type ParamsInput<Item, Operation, InferRuntimeMetadata extends boolean> = Simplify<
  LocationField<'query', LocationParameters<Item, Operation, 'query'>> &
    QuerystringField<Item, Operation, InferRuntimeMetadata> &
    LocationField<'header', LocationParameters<Item, Operation, 'header'>> &
    LocationField<'cookie', LocationParameters<Item, Operation, 'cookie'>>
>;

type HasRequiredParams<Item, Operation> =
  HasRequiredKeys<LocationParameters<Item, Operation, 'query'>> extends true
    ? true
    : HasRequiredKeys<LocationParameters<Item, Operation, 'querystring'>> extends true
      ? true
      : HasRequiredKeys<LocationParameters<Item, Operation, 'header'>> extends true
        ? true
        : HasRequiredKeys<LocationParameters<Item, Operation, 'cookie'>> extends true
          ? true
          : false;

type RequestBodyOf<Operation> = 'requestBody' extends keyof Operation
  ? Operation extends { requestBody?: infer Body }
    ? Defined<Body>
    : never
  : never;

type RequestBodyContent<Operation> =
  RequestBodyOf<Operation> extends infer Body
    ? Body extends { content?: infer Content }
      ? Defined<Content>
      : never
    : never;

type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never;

type ConcreteContentTypeForMedia<Media extends string> = Media extends '*/*'
  ? `${string}/${string}`
  : Media extends `${infer Type}/*`
    ? `${Type}/${string}`
    : Media;

type CanInferConcreteMedia<Media extends string> = Media extends '*/*'
  ? false
  : Media extends `${string}/*`
    ? false
    : true;

type BodyForMedia<
  Content,
  Media extends string,
  InferSingleMedia extends boolean,
  Single extends boolean,
> = {
  body: Media extends keyof Content ? Content[Media] : never;
} & (InferSingleMedia extends true
  ? Single extends true
    ? CanInferConcreteMedia<Media> extends true
      ? { contentType?: ConcreteContentTypeForMedia<Media> }
      : { contentType: ConcreteContentTypeForMedia<Media> }
    : { contentType: ConcreteContentTypeForMedia<Media> }
  : { contentType: ConcreteContentTypeForMedia<Media> });

type BodyVariants<Content, InferSingleMedia extends boolean> = Content extends object
  ? StringKeyOf<Content> extends infer Media extends string
    ? [Media] extends [never]
      ? { body: unknown; contentType: string }
      : {
          [M in Media]: BodyForMedia<
            Content,
            M,
            InferSingleMedia,
            IsUnion<Media> extends true ? false : true
          >;
        }[Media]
    : never
  : { body: unknown; contentType: string };

type IsRequestBodyRequired<Operation> = 'requestBody' extends keyof Operation
  ? undefined extends Operation['requestBody' & keyof Operation]
    ? false
    : true
  : false;

type BodyInput<Operation, InferSingleMedia extends boolean> = [RequestBodyOf<Operation>] extends [
  never,
]
  ? { body?: never; contentType?: never }
  : IsRequestBodyRequired<Operation> extends true
    ? BodyVariants<RequestBodyContent<Operation>, InferSingleMedia>
    :
        | BodyVariants<RequestBodyContent<Operation>, InferSingleMedia>
        | { body?: never; contentType?: never };

type OperationBaseInput<Item, Operation, InferSingleMedia extends boolean> =
  BodyInput<Operation, InferSingleMedia> extends infer Body
    ? Body extends unknown
      ? Simplify<
          ParamsInput<Item, Operation, InferSingleMedia> &
            Body & {
              init?: Omit<RequestInit, 'method' | 'body' | 'headers'> & {
                headers?: HeadersInit;
              };
            }
        >
      : never
    : never;

type PresentBodyInput<Operation, InferSingleMedia extends boolean> =
  BodyInput<Operation, InferSingleMedia> extends infer Body
    ? Body extends { body: infer Value; contentType?: infer ContentType }
      ? { body: Value; contentType: Defined<ContentType> }
      : never
    : never;

type PathParameterValues<Item, Operation> = ValueOf<LocationParameters<Item, Operation, 'path'>>;

type MaybePromise<T> = T | Promise<T>;

/**
 * Per-call escape hatches whose inputs and outputs are derived from the exact
 * OpenAPI operation selected by the chain. They never widen the public call
 * signature to `unknown`/`any`.
 */
export type OperationExtensions<Item, Operation, InferSingleMedia extends boolean = false> = {
  path?: (value: PathParameterValues<Item, Operation>, context: { index: number }) => string;
  query?: (query: LocationParameters<Item, Operation, 'query'>) => string | URLSearchParams;
  querystring?: (
    querystring: LocationParameters<Item, Operation, 'querystring'>,
  ) => string | URLSearchParams;
  header?: (header: LocationParameters<Item, Operation, 'header'>) => HeadersInit;
  cookie?: (cookie: LocationParameters<Item, Operation, 'cookie'>) => string;
  body?: (input: PresentBodyInput<Operation, InferSingleMedia>) => BodyInit | undefined;
  response?: (response: Response) => MaybePromise<OperationResponseExtensionResult<Operation>>;
  /** Patches an already validated/serialized request; cannot bypass earlier failures. */
  request?: (
    request: TransportRequest,
    input: Readonly<OperationBaseInput<Item, Operation, InferSingleMedia>>,
  ) => MaybePromise<TransportRequest>;
};

export type OperationInput<Item, Operation, InferSingleMedia extends boolean = false> =
  OperationBaseInput<Item, Operation, InferSingleMedia> extends infer Input
    ? Input extends object
      ? Simplify<
          Input & {
            extensions?: OperationExtensions<Item, Operation, InferSingleMedia>;
          }
        >
      : never
    : never;

export type OperationExtensionsFor<
  Paths extends OpenAPIPaths,
  Path extends StringKeyOf<Paths>,
  Method extends Extract<keyof Paths[Path], HttpMethod>,
  InferSingleMedia extends boolean = false,
> = OperationExtensions<Paths[Path], Defined<Paths[Path][Method]>, InferSingleMedia>;

export type OperationInputFor<
  Paths extends OpenAPIPaths,
  Path extends StringKeyOf<Paths>,
  Method extends Extract<keyof Paths[Path], HttpMethod>,
  InferSingleMedia extends boolean = false,
> = OperationInput<Paths[Path], Defined<Paths[Path][Method]>, InferSingleMedia>;

type HasRequiredInput<Item, Operation> =
  HasRequiredParams<Item, Operation> extends true ? true : IsRequestBodyRequired<Operation>;

type ResponsesOf<Operation> = 'responses' extends keyof Operation
  ? Defined<Operation['responses' & keyof Operation]>
  : {};

type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type StatusHundreds = 1 | 2 | 3 | 4 | 5;
type StatusFromHundred<H extends StatusHundreds> =
  `${H}${Digit}${Digit}` extends `${infer N extends number}` ? N : never;
type HttpStatus = StatusFromHundred<StatusHundreds>;
type SuccessHttpStatus = StatusFromHundred<2>;
type ErrorHttpStatus = Exclude<HttpStatus, SuccessHttpStatus>;

type ExactStatusOfKey<Key> = Key extends number
  ? Key extends HttpStatus
    ? Key
    : never
  : Key extends `${infer N extends number}`
    ? N extends HttpStatus
      ? N
      : never
    : never;

type WildcardStatusOfKey<Key> = Key extends `${infer H extends StatusHundreds}${'XX' | 'xx'}`
  ? StatusFromHundred<H>
  : never;

type ExactStatuses<Responses> = keyof Responses extends infer Key
  ? Key extends unknown
    ? ExactStatusOfKey<Key>
    : never
  : never;

type WildcardCoveredStatuses<Responses> = keyof Responses extends infer Key
  ? Key extends unknown
    ? WildcardStatusOfKey<Key>
    : never
  : never;

type ResponseBodyOfSpec<ResponseSpec> = ResponseSpec extends {
  content?: infer Content;
}
  ? [Defined<Content>] extends [never]
    ? undefined
    : Defined<Content> extends infer C
      ? C extends object
        ? [keyof C] extends [never]
          ? undefined
          : ValueOf<C>
        : undefined
      : undefined
  : undefined;

type ResultShape<ResponseSpec, Status extends number, Ok extends boolean> = {
  ok: Ok;
  status: Status;
  data: ResponseBodyOfSpec<ResponseSpec>;
  response: Response;
};

type ResultForStatuses<ResponseSpec, Status extends HttpStatus> =
  | ([Extract<Status, SuccessHttpStatus>] extends [never]
      ? never
      : ResultShape<ResponseSpec, Extract<Status, SuccessHttpStatus>, true>)
  | ([Extract<Status, ErrorHttpStatus>] extends [never]
      ? never
      : ResultShape<ResponseSpec, Extract<Status, ErrorHttpStatus>, false>);

type ExactResults<Responses> = {
  [Key in keyof Responses]: ExactStatusOfKey<Key> extends infer Status extends HttpStatus
    ? ResultForStatuses<Responses[Key], Status>
    : never;
}[keyof Responses];

type WildcardResults<Responses> = {
  [Key in keyof Responses]: WildcardStatusOfKey<Key> extends infer Status extends HttpStatus
    ? [Status] extends [never]
      ? never
      : ResultForStatuses<Responses[Key], Exclude<Status, ExactStatuses<Responses>>>
    : never;
}[keyof Responses];

type DefaultResults<Responses> = 'default' extends keyof Responses
  ? Exclude<
      HttpStatus,
      ExactStatuses<Responses> | WildcardCoveredStatuses<Responses>
    > extends infer Status extends HttpStatus
    ? ResultForStatuses<Responses['default'], Status>
    : never
  : never;

type AllResults<Operation> =
  ResponsesOf<Operation> extends infer Responses
    ? Responses extends object
      ? ExactResults<Responses> | WildcardResults<Responses> | DefaultResults<Responses>
      : never
    : never;

export type SuccessResult<Operation> =
  AllResults<Operation> extends infer Result
    ? Result extends { ok: true }
      ? Result
      : never
    : never;

export type ErrorResult<Operation> =
  AllResults<Operation> extends infer Result
    ? Result extends { ok: false }
      ? Result
      : never
    : never;

export type ApiResult<Operation> = SuccessResult<Operation> | ErrorResult<Operation>;

/** Status-correlated result required from an operation-local response parser. */
export type OperationResponseExtensionResult<Operation> =
  ApiResult<Operation> extends infer Result
    ? Result extends { status: infer Status extends number; data: infer Data }
      ? { status: Status; data: Data }
      : never
    : never;

/** Any response body declared by an operation, across success and error statuses. */
export type OperationResponseData<Operation> =
  ApiResult<Operation> extends infer Result
    ? Result extends { data: infer Data }
      ? Data
      : never
    : never;

export type SuccessData<Operation> =
  SuccessResult<Operation> extends infer Result
    ? Result extends { data: infer Data }
      ? Data
      : never
    : never;

type OperationCall<
  Item,
  Operation,
  ThrowOnError extends boolean,
  InferSingleMedia extends boolean,
> = (
  ...args: HasRequiredInput<Item, Operation> extends true
    ? [options: OperationInput<Item, Operation, InferSingleMedia>]
    : [options?: OperationInput<Item, Operation, InferSingleMedia>]
) => Promise<ThrowOnError extends true ? SuccessData<Operation> : ApiResult<Operation>>;

type MethodForEntry<
  Entry,
  ThrowOnError extends boolean,
  InferSingleMedia extends boolean,
> = Entry extends {
  item: infer Item;
  operation: infer Operation;
  method: infer Method extends HttpMethod;
}
  ? {
      [M in Method]: OperationCall<Item, Operation, ThrowOnError, InferSingleMedia>;
    }
  : {};

type OperationMethods<Entries, ThrowOnError extends boolean, InferSingleMedia extends boolean> = [
  Entries,
] extends [never]
  ? {}
  : UnionToIntersection<
      Entries extends unknown ? MethodForEntry<Entries, ThrowOnError, InferSingleMedia> : never
    >;

type PathParameterValue<
  Item,
  Operation,
  Name extends string,
> = Name extends keyof LocationParameters<Item, Operation, 'path'>
  ? Defined<LocationParameters<Item, Operation, 'path'>[Name]>
  : PathValue;

type TemplateArgumentForEntry<Entry> = Entry extends {
  item: infer Item;
  operation: infer Operation;
  segments: [infer Head extends string, ...string[]];
}
  ? Head extends `{${infer Name}}`
    ? PathParameterValue<Item, Operation, Name>
    : never
  : never;

type TemplateArgument<Entries> = Entries extends unknown
  ? TemplateArgumentForEntry<Entries>
  : never;

type FilterTemplateEntries<Entries, Value> = Entries extends unknown
  ? Value extends TemplateArgumentForEntry<Entries>
    ? Entries
    : never
  : never;

type DynamicNode<
  Entries,
  ThrowOnError extends boolean,
  InferSingleMedia extends boolean,
  MetadataRouting extends boolean,
  RouteEntries,
> = <Value extends TemplateArgument<Entries>>(
  value: Value,
) => Value extends unknown
  ? BuildNode<
      AdvanceTemplates<FilterTemplateEntries<Entries, Value>>,
      ThrowOnError,
      InferSingleMedia,
      MetadataRouting,
      AdvanceTemplates<RouteEntries>
    >
  : never;

type EntryMethods<E> = E extends { method: infer M extends HttpMethod } ? M : never;
type EntryPaths<E> = E extends { path: infer P } ? P : never;
type UnambiguousEntries<E, All = E> = E extends { method: infer M }
  ? true extends IsUnion<EntryPaths<Extract<All, { method: M }>>>
    ? never
    : E
  : never;

type BuildNode<
  Entries,
  ThrowOnError extends boolean,
  InferSingleMedia extends boolean,
  MetadataRouting extends boolean,
  RouteEntries = Entries,
> = OperationMethods<
  MetadataRouting extends true
    ? UnambiguousEntries<LeafEntries<Entries>, LeafEntries<RouteEntries>>
    : LeafEntries<Entries>,
  ThrowOnError,
  InferSingleMedia
> & {
  [
    Segment in FirstSegment<Entries> as Segment extends string
      ? IsSafeStaticSegment<
          Segment,
          MetadataRouting extends true
            ? '$path' | 'then' | EntryMethods<LeafEntries<RouteEntries>>
            : ReservedSegment
        > extends true
        ? Segment
        : never
      : never
  ]: BuildNode<
    Advance<Entries, Segment>,
    ThrowOnError,
    InferSingleMedia,
    MetadataRouting,
    Advance<RouteEntries, Segment>
  >;
} & ([TemplateEntries<Entries>] extends [never]
    ? {}
    : DynamicNode<
        TemplateEntries<Entries>,
        ThrowOnError,
        InferSingleMedia,
        MetadataRouting,
        TemplateEntries<RouteEntries>
      >);

type TemplateNames<Path extends string> = Path extends `${string}{${infer Name}}${infer Rest}`
  ? Name | TemplateNames<Rest>
  : never;

type PathParamsForEntry<Entry, Path extends string> = Entry extends {
  item: infer Item;
  operation: infer Operation;
}
  ? Simplify<{
      [Name in TemplateNames<Path>]: PathParameterValue<Item, Operation, Name>;
    }>
  : never;

type EntriesForPath<
  Paths extends OpenAPIPaths,
  Path extends StringKeyOf<Paths>,
> = OperationEntryForPath<Path, Paths[Path]>;

type PathParamsUnion<Entries, Path extends string> = Entries extends unknown
  ? PathParamsForEntry<Entries, Path>
  : never;

type IncompatibleParamNames<Entry, Path extends string, Params> = Entry extends {
  item: infer Item;
  operation: infer Operation;
}
  ? {
      [Name in TemplateNames<Path>]: Name extends keyof Params
        ? Params[Name] extends PathParameterValue<Item, Operation, Name>
          ? never
          : Name
        : Name;
    }[TemplateNames<Path>]
  : TemplateNames<Path>;

type FilterEntriesByParams<Entries, Path extends string, Params> = Entries extends unknown
  ? [IncompatibleParamNames<Entries, Path, Params>] extends [never]
    ? Entries
    : never
  : never;

type PathEscape<
  Paths extends OpenAPIPaths,
  ThrowOnError extends boolean,
  InferSingleMedia extends boolean,
> = {
  $path<
    Path extends StringKeyOf<Paths>,
    Entries extends EntriesForPath<Paths, Path> = EntriesForPath<Paths, Path>,
    Params extends PathParamsUnion<Entries, Path> = PathParamsUnion<Entries, Path>,
  >(
    path: Path,
    ...args: [TemplateNames<Path>] extends [never]
      ? []
      : [params: Params & Record<Exclude<keyof Params, TemplateNames<Path>>, never>]
  ): OperationMethods<
    [TemplateNames<Path>] extends [never] ? Entries : FilterEntriesByParams<Entries, Path, Params>,
    ThrowOnError,
    InferSingleMedia
  >;
};

export type API<
  Paths extends OpenAPIPaths,
  ThrowOnError extends boolean = true,
  InferSingleMedia extends boolean = false,
  MetadataRouting extends boolean = false,
> = BuildNode<
  OperationEntries<Paths, MetadataRouting>,
  ThrowOnError,
  InferSingleMedia,
  MetadataRouting
> &
  PathEscape<Paths, ThrowOnError, InferSingleMedia>;
