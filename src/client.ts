/* oxlint-disable typescript/no-base-to-string -- Core scalar coercion intentionally follows String(); structured serialization uses typed extensions. */
import { httpMethods } from './constant.js';
import {
  HttpError,
  type API,
  type CoreClientOptions,
  type HttpMethod,
  type OpenAPIPaths,
  type RequestInput,
  type Transport,
  type TransportRequest,
} from './type.js';

type S = { d: boolean; v: unknown };
type State = { c: S[] } | { t: string; p?: Record<string, unknown> | undefined };
type Ext = {
  path?: (v: unknown, c: { index: number }) => string;
  query?: (v: Record<string, unknown>) => string | URLSearchParams;
  header?: (v: Record<string, unknown>) => HeadersInit;
  cookie?: (v: Record<string, unknown>) => string;
  body?: (v: { body: unknown; contentType: string }) => BodyInit | undefined;
  response?: (
    r: Response,
  ) => { status: number; data: unknown } | Promise<{ status: number; data: unknown }>;
  request?: (r: TransportRequest, i: RequestInput) => TransportRequest | Promise<TransportRequest>;
};
type R = { o: CoreClientOptions; send: Transport };

const isMethod = (v: string): v is HttpMethod => httpMethods.includes(v as HttpMethod);
const enc = (v: unknown) => encodeURIComponent(String(v));
const text = (v: string | URLSearchParams) =>
  (typeof v === 'string' ? v : v.toString()).replace(/^\?/, '');
const native = (v: unknown): v is BodyInit =>
  typeof v === 'string' ||
  (typeof Blob !== 'undefined' && v instanceof Blob) ||
  (typeof FormData !== 'undefined' && v instanceof FormData) ||
  (typeof URLSearchParams !== 'undefined' && v instanceof URLSearchParams) ||
  (typeof ArrayBuffer !== 'undefined' && v instanceof ArrayBuffer);

function query(v: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, x] of Object.entries(v)) {
    if (x == null) continue;
    if (Array.isArray(x)) x.forEach((y) => q.append(k, String(y)));
    else if (typeof x === 'object')
      Object.entries(x as Record<string, unknown>).forEach(
        ([a, b]) => b != null && q.append(a, String(b)),
      );
    else q.append(k, String(x));
  }
  return q.toString();
}

function add(url: string, q: string) {
  if (!q) return url;
  const n = url.indexOf('#');
  const hash = n < 0 ? '' : url.slice(n);
  const base = n < 0 ? url : url.slice(0, n);
  return `${base}${base.includes('?') ? '&' : '?'}${q}${hash}`;
}

function render(s: State, f?: Ext['path']) {
  let i = 0;
  const e = (v: unknown) => (f ? f(v, { index: i++ }) : enc(v));
  if ('t' in s)
    return s.t.replace(/\{([^{}]+)\}/g, (_m, k: string) => {
      if (!s.p || !Object.hasOwn(s.p, k)) throw new TypeError(`Missing path: ${k}`);
      return e(s.p[k]);
    });
  return s.c.length ? `/${s.c.map((x) => (x.d ? e(x.v) : x.v)).join('/')}` : '/';
}

function requestBody(v: unknown, ct: string | undefined, h: Headers, f?: Ext['body']) {
  if (v === undefined) return undefined;
  if (!ct) throw new TypeError('Schema-free body needs contentType.');
  if (f) {
    const x = f({ body: v, contentType: ct });
    if (typeof FormData !== 'undefined' && x instanceof FormData) h.delete('content-type');
    else h.set('content-type', ct);
    return x;
  }
  const m = ct.split(';', 1)[0]!.trim().toLowerCase();
  if (m === 'application/json' || m.endsWith('+json')) {
    h.set('content-type', ct);
    return JSON.stringify(v);
  }
  if (m.startsWith('text/') && typeof v !== 'object') {
    h.set('content-type', ct);
    return String(v);
  }
  if (native(v)) {
    if (typeof FormData !== 'undefined' && v instanceof FormData) h.delete('content-type');
    else h.set('content-type', ct);
    return v;
  }
  throw new TypeError(`Structured ${ct} needs body extension.`);
}

async function parse(r: Response) {
  if ([204, 205, 304].includes(r.status) || r.headers.get('content-length') === '0')
    return undefined;
  const s = await r.text();
  if (!s) return undefined;
  return (r.headers.get('content-type') ?? '').toLowerCase().includes('json') ? JSON.parse(s) : s;
}

async function exec(r: R, s: State, m: HttpMethod, i?: RequestInput) {
  const x = i?.extensions as Ext | undefined;
  const h = new Headers(r.o.headers);
  if (i?.header) {
    if (x?.header) new Headers(x.header(i.header)).forEach((v, k) => h.set(k, v));
    else
      for (const [k, v] of Object.entries(i.header))
        if (v != null) h.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  if (i?.init?.headers) new Headers(i.init.headers).forEach((v, k) => h.set(k, v));
  if (i?.cookie) {
    if (x?.cookie) h.set('cookie', x.cookie(i.cookie));
    else {
      const a: string[] = [];
      for (const [k, v] of Object.entries(i.cookie)) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((y) => a.push(`${enc(k)}=${enc(y)}`));
        else a.push(`${enc(k)}=${enc(v)}`);
      }
      if (a.length) h.set('cookie', a.join('; '));
    }
  }
  let url = r.o.baseUrl.replace(/\/?(?=[?#]|$)/, render(s, x?.path));
  if (i?.query) url = add(url, x?.query ? text(x.query(i.query)) : query(i.query));
  let req: TransportRequest = {
    url,
    method: m,
    init: {
      ...i?.init,
      method: m.toUpperCase(),
      headers: h,
      body: requestBody(i?.body, i?.contentType, h, x?.body) ?? null,
    },
  };
  if (x?.request) req = await x.request(req, i ?? {});
  const response = await r.send(req);
  let data: unknown;
  if (x?.response) {
    const y = await x.response(response);
    if (y.status !== response.status) throw new TypeError('Response status mismatch');
    data = y.data;
  } else data = await parse(response);
  const ok = response.status >= 200 && response.status < 300;
  if (r.o.throwOnError === false) return { ok, status: response.status, data, response };
  if (!ok) throw new HttpError(`HTTP ${response.status}`, response, data);
  return data;
}

function node(r: R, s: State): unknown {
  return new Proxy(() => 0, {
    get(_t, p) {
      if (p === 'then') return undefined;
      if (typeof p === 'symbol') return undefined;
      if (p === '$path' && 'c' in s && !s.c.length)
        return (t: string, params?: Record<string, unknown>) => node(r, { t, p: params });
      if (isMethod(p)) return (i?: RequestInput) => exec(r, s, p, i);
      if (!('c' in s)) throw new TypeError('$path() terminal.');
      return node(r, { c: [...s.c, { d: false, v: p }] });
    },
    apply(_t, _a, v) {
      if (!('c' in s) || v.length !== 1) throw new TypeError('Path parameter needs 1 argument.');
      return node(r, { c: [...s.c, { d: true, v: v[0] }] });
    },
  });
}

function runtime(o: CoreClientOptions): R {
  const f = o.fetch ?? globalThis.fetch;
  if (!o.transport && typeof f !== 'function') throw new TypeError('Need fetch/transport.');
  return { o, send: o.transport ?? ((r) => f(r.url, r.init)) };
}

export function createClient<P extends OpenAPIPaths>(
  o: CoreClientOptions & { throwOnError: false },
): API<P, false, false>;
export function createClient<P extends OpenAPIPaths>(
  o: CoreClientOptions & { throwOnError?: true | undefined },
): API<P, true, false>;
export function createClient<P extends OpenAPIPaths>(o: CoreClientOptions): API<P, boolean, false>;
export function createClient<P extends OpenAPIPaths>(o: CoreClientOptions): API<P, boolean, false> {
  return node(runtime(o), { c: [] }) as API<P, boolean, false>;
}
