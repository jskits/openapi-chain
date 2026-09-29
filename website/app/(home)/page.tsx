import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import { Gauge, GitCompareArrows, Layers, Plug } from 'lucide-react';
import { appDescription, appName, repositoryUrl } from '@/lib/shared';
import logo from '../../../assets/logo/openapi-chain-logo-1024.png';

export const metadata: Metadata = {
  title: { absolute: `${appName}: exact OpenAPI requests for complex and large APIs` },
  description: appDescription,
};

const themes = { light: 'github-light', dark: 'github-dark' } as const;

const config = `{
  "schema": "./openapi.json",
  "outDir": "./src/generated/api",
  "paths": ["/items/{id}"]
}`;

const request = `import { createStrictClient } from 'openapi-chain/strict';
import { metadata } from './generated/api/metadata.js';
import type { ScopedPaths } from './generated/api/scope.js';

const api = createStrictClient<ScopedPaths>({
  baseUrl: 'https://api.example.com',
  metadata,
});
const item = await api.items('42').get();
console.log(item.name);`;

// Rows from docs/wire-comparison.md; test/wire-comparison.test.ts asserts every value.
const wireRows = [
  {
    declaration: 'color: array, explode: false',
    chain: '?color=blue,black,brown',
    fetch: '?color=blue&color=black&color=brown',
  },
  {
    declaration: 'id: array, style: label',
    chain: '/items/.3,4,5',
    fetch: '/items/3,4,5',
  },
  {
    declaration: 'session: cookie parameter',
    chain: 'cookie: session=abc',
    fetch: 'no Cookie header',
  },
  {
    declaration: 'form body with deepObject address',
    chain: 'address%5Bcity%5D=Paris',
    fetch: 'address=%5Bobject+Object%5D',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-4 py-16 md:py-24">
      <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12">
        <div className="relative order-first flex justify-center md:order-last">
          {/* A soft glow in the mark's blue and teal keeps the logo from floating on the page. */}
          <div
            aria-hidden
            className="absolute inset-x-[8%] inset-y-[18%] rounded-full bg-[radial-gradient(closest-side,rgba(37,99,235,0.28),transparent),radial-gradient(closest-side_at_75%_50%,rgba(45,212,191,0.28),transparent)] blur-2xl"
          />
          <Image
            src={logo}
            alt="openapi-chain logo"
            priority
            sizes="(min-width: 768px) 480px, 80vw"
            className="relative h-auto w-4/5 max-w-[480px] md:w-full"
          />
        </div>
        <div className="flex min-w-0 flex-col items-center gap-6 text-center md:items-start md:text-left">
          <p className="rounded-full border border-fd-border bg-fd-card px-3 py-1 text-sm text-fd-muted-foreground">
            {/* The full list wraps into two lines on phones, so narrow screens get a shorter label. */}
            <span className="sm:hidden">OpenAPI 3.0–3.2 · no runtime dependencies</span>
            <span className="hidden sm:inline">
              OpenAPI 3.0, 3.1 and 3.2 · ESM and CommonJS · no runtime dependencies
            </span>
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            <span className="block">Spec-exact requests.</span>
            <span className="block">Fluent, fully typed calls.</span>
            <span className="block">Fast type-checks on huge specs.</span>
          </h1>
          <p className="max-w-2xl text-lg text-fd-muted-foreground">
            openapi-chain compiles the serialization rules an OpenAPI document declares and applies
            them to every request. A build-time CLI scopes types and metadata to the paths you call,
            so complex and large APIs stay correct and affordable.
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:justify-start">
            <Link
              href="/docs/getting-started"
              className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground"
            >
              Get started
            </Link>
            <Link
              href="/docs/wire-comparison"
              className="rounded-lg border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium"
            >
              See the wire comparison
            </Link>
            <a
              href={repositoryUrl}
              className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-medium"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="text-xl font-semibold">Generate once</h2>
          <p className="text-fd-muted-foreground">
            One config produces declarations, a path scope and matching runtime metadata.{' '}
            <code>generate --check</code> catches drift in CI.
          </p>
          <ServerCodeBlock
            code={config}
            lang="json"
            themes={themes}
            codeblock={{ title: 'openapi-chain.config.json' }}
          />
          <ServerCodeBlock code="pnpm exec openapi-chain generate" lang="sh" themes={themes} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="text-xl font-semibold">Call with a fluent path</h2>
          <p className="text-fd-muted-foreground">
            Static segments become properties and parameters become calls. Inputs and responses are
            typed from the selected operation.
          </p>
          <ServerCodeBlock
            code={request}
            lang="ts"
            themes={themes}
            codeblock={{ title: 'src/client.ts' }}
          />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-2xl font-semibold">
          What the document declares is what the server gets
        </h2>
        <p className="max-w-3xl text-fd-muted-foreground">
          For the same operation and input, openapi-fetch 0.17.0 sends a different request in 16 of
          20 tested declarations. Every row is asserted by the repository&apos;s tests.
        </p>
        <div className="overflow-x-auto rounded-xl border border-fd-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-fd-card text-fd-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Declaration</th>
                <th className="px-4 py-3 font-medium">openapi-chain strict</th>
                <th className="px-4 py-3 font-medium">openapi-fetch 0.17.0</th>
              </tr>
            </thead>
            <tbody>
              {wireRows.map((row) => (
                <tr key={row.declaration} className="border-t border-fd-border">
                  <td className="px-4 py-3">{row.declaration}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.chain}</td>
                  <td className="px-4 py-3 font-mono text-xs text-fd-muted-foreground">
                    {row.fetch}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link href="/docs/wire-comparison" className="text-sm font-medium underline">
          All 20 cases and how to match them with openapi-fetch
        </Link>
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-2xl font-semibold">Why teams choose it</h2>
        <Cards>
          <Card
            icon={<GitCompareArrows />}
            title="Exact wire serialization"
            description="Parameter styles, explode, allowReserved, parameter content, media types and form or multipart Encoding Objects, from the document. Unsupported representations fail instead of guessing."
            href="/docs/support"
          />
          <Card
            icon={<Layers />}
            title="Scoped generation for large documents"
            description="On the pinned GitHub REST document, scoping a 40-operation consumer cut TypeScript 7 check time from 0.49 s to 0.045 s."
            href="/docs/performance#real-schemas"
          />
          <Card
            icon={<Plug />}
            title="Keep openapi-fetch"
            description="withOpenAPISerialization applies the same serialization inside an existing openapi-fetch client; its types, middleware and results stay the same."
            href="/docs/openapi-fetch-adapter"
          />
          <Card
            icon={<Gauge />}
            title="Small schema-free core"
            description="A 3.5 KiB gzip budget for the default client, with bundle size and request overhead in the same range as openapi-fetch."
            href="/docs/performance#comparison-with-other-clients"
          />
        </Cards>
      </section>

      <section className="rounded-xl border border-fd-border bg-fd-card p-6 md:p-8">
        <h2 className="mb-3 text-xl font-semibold">When to choose openapi-chain</h2>
        <p className="text-fd-muted-foreground">
          Choose the strict client when your document declares non-default parameter styles,
          parameter <code>content</code>, cookie parameters, non-JSON media types or form and
          multipart encoding, and the server depends on them. Choose scoped generation when a large
          document makes type-checking or metadata delivery expensive. If your API only uses JSON
          bodies and default parameter styles, openapi-fetch and openapi-chain&apos;s core are
          comparable; pick the call style you prefer. Without scoping, openapi-chain&apos;s fluent
          types cost more to check than openapi-fetch&apos;s on the measured GitHub and Stripe
          documents.
        </p>
      </section>
    </main>
  );
}
