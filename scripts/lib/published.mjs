export const REGISTRY = 'https://registry.npmjs.org';
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export class RegistryContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryContractError';
  }
}

export function publicationProblem(record, { name, version }) {
  if (record?.name !== name || record?.version !== version)
    throw new RegistryContractError(
      `${name}@${version}: registry returned ${String(record?.name)}@${String(record?.version)}`,
    );
  if (typeof record.dist?.integrity !== 'string' || !record.dist.integrity)
    return 'dist.integrity is missing';
  if (
    typeof record.dist.attestations?.provenance?.predicateType !== 'string' ||
    !record.dist.attestations.provenance.predicateType
  )
    return 'dist.attestations.provenance is missing';
  return null;
}

export async function readRegistryVersion(expected, fetchImpl = fetch) {
  const url = new URL(
    `${encodeURIComponent(expected.name)}/${encodeURIComponent(expected.version)}`,
    `${REGISTRY}/`,
  );
  // npm's CDN may briefly cache a 404 or pre-attestation document after publish.
  url.searchParams.set('verification', String(Date.now()));
  let response;
  try {
    response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return {
      problem: `registry request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (response.status === 404 || response.status === 429 || response.status >= 500)
    return { problem: `registry returned HTTP ${response.status}` };
  if (!response.ok)
    throw new RegistryContractError(
      `${expected.name}@${expected.version}: registry returned unexpected HTTP ${response.status}`,
    );
  let record;
  try {
    record = await response.json();
  } catch (error) {
    return {
      problem: `registry metadata is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const problem = publicationProblem(record, expected);
  return problem ? { problem } : { record };
}

export async function waitForPublished(
  packages,
  {
    read = readRegistryVersion,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollMs = 15_000,
    log = console.log,
  } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0)
    throw new TypeError('Registry polling requires a finite timeout and positive interval.');
  const deadline = now() + timeoutMs;
  let previousSummary;
  while (true) {
    const observations = await Promise.all(
      packages.map(async (pkg) => ({ pkg, result: await read(pkg) })),
    );
    const pending = observations
      .filter(({ result }) => !result.record)
      .map(({ pkg, result }) => `${pkg.name}@${pkg.version}: ${result.problem}`);
    if (pending.length === 0) return observations.map(({ result }) => result.record);
    const summary = pending.join('; ');
    if (summary !== previousSummary) {
      log(`Waiting for npm registry publication: ${summary}`);
      previousSummary = summary;
    }
    const remaining = deadline - now();
    if (remaining <= 0)
      throw new Error(`npm registry publication check timed out after ${timeoutMs} ms: ${summary}`);
    await sleep(Math.min(pollMs, remaining));
  }
}
