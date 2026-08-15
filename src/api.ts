import type { PairSnapshot } from './types';

export interface DiscoveryCandidate {
  tokenAddress: string;
  chainId: string;
  source: string;
  sources: string[];
  url: string | null;
  icon: string | null;
  header: string | null;
  description: string | null;
  links: unknown[];
}

interface DiscoveryResponse {
  fetchedAt: number;
  sources: string[];
  count: number;
  candidates: DiscoveryCandidate[];
}

/*
 * ============================================================
 * DISCOVERY
 * ============================================================
 *
 * The server is responsible for combining the different
 * DexScreener discovery endpoints.
 *
 * The frontend receives one candidate per token address.
 *
 * Example:
 *
 * Token A
 *   sources:
 *     token-profiles-latest
 *     token-boosts-latest
 *
 * Token B
 *   sources:
 *     token-boosts-top
 *
 * Token C
 *   sources:
 *     token-profiles-latest
 *     token-boosts-top
 *
 * Duplicate token addresses are removed by the server.
 * ============================================================
 */

export async function discover(): Promise<
  DiscoveryCandidate[]
> {
  const response = await fetch(
    '/api/discovery',
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  const data =
    (await response.json()) as DiscoveryResponse;

  const candidates =
    Array.isArray(data.candidates)
      ? data.candidates
      : [];

  /*
   * Defensive frontend deduplication.
   *
   * Even if the server already deduplicates,
   * we do not allow duplicate token addresses
   * into the research engine.
   */
  const map =
    new Map<
      string,
      DiscoveryCandidate
    >();

  for (const candidate of candidates) {
    if (
      !candidate?.tokenAddress
    ) {
      continue;
    }

    const address =
      candidate.tokenAddress;

    const existing =
      map.get(address);

    if (!existing) {
      map.set(address, {
        ...candidate,

        sources: [
          ...new Set([
            ...(candidate.sources ?? []),
            ...(candidate.source
              ? [candidate.source]
              : []),
          ]),
        ],
      });

      continue;
    }

    /*
     * Merge discovery sources.
     */
    existing.sources = [
      ...new Set([
        ...(existing.sources ?? []),
        ...(candidate.sources ?? []),
        ...(candidate.source
          ? [candidate.source]
          : []),
      ]),
    ];

    /*
     * Keep useful metadata if the
     * first source did not provide it.
     */
    existing.url =
      existing.url ??
      candidate.url ??
      null;

    existing.icon =
      existing.icon ??
      candidate.icon ??
      null;

    existing.header =
      existing.header ??
      candidate.header ??
      null;

    existing.description =
      existing.description ??
      candidate.description ??
      null;

    if (
      existing.links.length === 0 &&
      candidate.links.length > 0
    ) {
      existing.links =
        candidate.links;
    }
  }

  return [
    ...map.values(),
  ];
}

/*
 * ============================================================
 * NUMBER HELPERS
 * ============================================================
 */

function toNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/*
 * ============================================================
 * PAIR SELECTION
 * ============================================================
 *
 * A token can have multiple pools.
 *
 * For now we select the Solana pair with
 * the highest liquidity.
 *
 * This keeps the acquisition layer simple.
 *
 * Later ChainScope can compare multiple
 * pools instead of selecting only one.
 * ============================================================
 */

function selectPair(
  pairs: any[]
): any | null {
  const solanaPairs =
    pairs.filter(
      pair =>
        pair?.chainId ===
        'solana'
    );

  if (
    !solanaPairs.length
  ) {
    return null;
  }

  return solanaPairs
    .slice()
    .sort(
      (a, b) =>
        (b?.liquidity?.usd ?? 0) -
        (a?.liquidity?.usd ?? 0)
    )[0];
}

/*
 * ============================================================
 * SINGLE TOKEN FETCH
 * ============================================================
 */

export async function fetchToken(
  address: string
): Promise<
  PairSnapshot | null
> {
  try {
    const response =
      await fetch(
        '/api/token/' +
          encodeURIComponent(
            address
          ),
        {
          cache: 'no-store',
        }
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const pairs =
      Array.isArray(
        data?.pairs
      )
        ? data.pairs
        : [];

    const pair =
      data?.selectedPair ??
      selectPair(pairs);

    if (!pair) {
      return null;
    }

    /*
     * Prefer m5 because the Alpha Pool
     * is researching early token behavior.
     *
     * Fall back to h1 when m5 is unavailable.
     */
    const volume =
      toNumber(
        pair.volume?.m5
      ) ??
      toNumber(
        pair.volume?.h1
      ) ??
      null;

    const transactions =
      pair.txns?.m5 ??
      pair.txns?.h1 ??
      null;

    const buys =
      transactions?.buys == null
        ? null
        : toNumber(
            transactions.buys
          );

    const sells =
      transactions?.sells == null
        ? null
        : toNumber(
            transactions.sells
          );

    const txns =
      buys !== null &&
      sells !== null
        ? buys + sells
        : null;

    const marketCap =
      toNumber(
        pair.marketCap
      ) ??
      toNumber(
        pair.fdv
      );

    const liquidityUsd =
      toNumber(
        pair.liquidity?.usd
      );

    const volumeMcRatio =
      marketCap !== null &&
      marketCap > 0 &&
      volume !== null
        ? volume / marketCap
        : null;

    return {
      tokenAddress:
        address,

      pairAddress:
        String(
          pair.pairAddress ??
            ''
        ),

      dexId:
        String(
          pair.dexId ??
            'unknown'
        ),

      pairCreatedAt:
        typeof pair.pairCreatedAt ===
        'number'
          ? pair.pairCreatedAt
          : null,

      fetchedAt:
        Date.now(),

      priceUsd:
        toNumber(
          pair.priceUsd
        ),

      marketCap,

      liquidityUsd,

      volume,

      buys,

      sells,

      txns,

      volumeMcRatio,
    };
  } catch {
    /*
     * One failed token must never stop
     * the entire Alpha Pool.
     */
    return null;
  }
}

/*
 * ============================================================
 * CONCURRENT TOKEN FETCH
 * ============================================================
 *
 * This is the important acquisition upgrade.
 *
 * Instead of:
 *
 *   token 1 → wait
 *   token 2 → wait
 *   token 3 → wait
 *
 * we do:
 *
 *   token 1 ┐
 *   token 2 ├── FETCH TOGETHER
 *   token 3 ┘
 *
 * The pool can therefore process many candidates
 * without sitting on "Discovering tokens..."
 *
 * Concurrency is deliberately limited so we do
 * not hammer the provider.
 * ============================================================
 */

export interface TokenFetchResult {
  tokenAddress: string;
  snapshot: PairSnapshot | null;
}

export async function fetchTokensConcurrent(
  addresses: string[],
  concurrency = 8
): Promise<
  TokenFetchResult[]
> {
  const unique = [
    ...new Set(
      addresses.filter(Boolean)
    ),
  ];

  if (!unique.length) {
    return [];
  }

  const results: TokenFetchResult[] =
    [];

  let index = 0;

  async function worker() {
    while (true) {
      const current =
        index++;

      if (
        current >=
        unique.length
      ) {
        return;
      }

      const address =
        unique[current];

      const snapshot =
        await fetchToken(
          address
        );

      results.push({
        tokenAddress:
          address,

        snapshot,
      });
    }
  }

  const workerCount =
    Math.min(
      Math.max(
        1,
        concurrency
      ),
      unique.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },
      () => worker()
    )
  );

  return results;
}

/*
 * ============================================================
 * EXPLICIT TOKEN → POOLS LOOKUP
 * ============================================================
 */

export async function fetchTokenPairs(
  address: string
) {
  const response =
    await fetch(
      '/api/token-pairs/' +
        encodeURIComponent(
          address
        )
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * EXPLICIT BATCH LOOKUP
 * ============================================================
 *
 * Maximum 30 addresses per request.
 * ============================================================
 */

export async function fetchTokensBatch(
  addresses: string[]
) {
  const unique = [
    ...new Set(addresses),
  ].slice(0, 30);

  if (!unique.length) {
    return [];
  }

  const response =
    await fetch(
      '/api/tokens?addresses=' +
        encodeURIComponent(
          unique.join(',')
        )
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * EXPLICIT PAIR LOOKUP
 * ============================================================
 */

export async function fetchPair(
  pairAddress: string
) {
  const response =
    await fetch(
      '/api/pair/' +
        encodeURIComponent(
          pairAddress
        )
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * DEXSCREENER SEARCH
 * ============================================================
 */

export async function searchDexScreener(
  query: string
) {
  const response =
    await fetch(
      '/api/search?q=' +
        encodeURIComponent(
          query
        )
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}
/*
 * ============================================================
 * CHAINSCOPE OBSERVER API
 * ============================================================
 *
 * ADDITIVE API LAYER
 *
 * These functions only retrieve Observer research
 * produced by the backend/research engine.
 *
 * They do NOT:
 *
 * - calculate grades
 * - calculate PATH
 * - calculate evidence
 * - modify observations
 * - invent missing timeframes
 *
 * The research engine remains the source of truth.
 *
 * ============================================================
 */

import type {
  ObserverEvidence,
  ObserverPerformance,
  TimeframeResult,
} from './types';

/*
 * ============================================================
 * OBSERVER TOKEN RESPONSE
 * ============================================================
 */

export interface ObserverTokenResponse {
  tokenAddress: string;

  pairAddress: string;

  dexId: string;

  firstSeenAt: number;

  discoverySources: string[];

  entryScore: {
    passed: number;
    total: number;
    required: number;
    qualified: boolean;
  } | null;

  observations: Array<{
    ageMinutes: number;

    timeframeId: string;

    observerEvidence:
      ObserverEvidence[];

    observerPerformance:
      ObserverPerformance;

    marketCap:
      number | null;

    liquidityUsd:
      number | null;

    volume:
      number | null;

    buys:
      number | null;

    sells:
      number | null;

    txns:
      number | null;

    priceUsd:
      number | null;

    pairAddress:
      string;

    dexId:
      string;

    fetchedAt:
      number;

    mcGrowth:
      number | null;

    liquidityGrowth:
      number | null;

    volumeGrowth:
      number | null;

    mcPullback:
      number | null;

    liquidityPullback:
      number | null;

    mcPullbackAbs:
      number | null;

    liquidityPullbackAbs:
      number | null;

    peakMarketCap:
      number | null;

    peakLiquidity:
      number | null;

    peakVolume:
      number | null;
  }>;

  timeframeResults:
    Record<
      string,
      TimeframeResult
    >;

  status:
    'ACTIVE' |
    'EXPIRED';

  currentTimeframeId:
    string;

  /*
   * Permanent historical PATH.
   *
   * The backend provides this.
   * The frontend does not calculate it.
   */

  path?: string | null;
}

/*
 * ============================================================
 * OBSERVER LIST RESPONSE
 * ============================================================
 */

export interface ObserverTokenSummary {
  tokenAddress: string;

  pairAddress:
    string;

  dexId:
    string;

  firstSeenAt:
    number;

  discoverySources:
    string[];

  entryScore:
    ObserverTokenResponse[
      'entryScore'
    ];

  status:
    'ACTIVE' |
    'EXPIRED';

  currentTimeframeId:
    string;

  path?:
    string | null;
}

/*
 * ============================================================
 * FETCH OBSERVER TOKEN
 * ============================================================
 *
 * Retrieves the complete research record.
 *
 * ============================================================
 */

export async function fetchObserverToken(
  address: string
): Promise<
  ObserverTokenResponse
> {
  const response =
    await fetch(
      '/api/observer/token/' +
        encodeURIComponent(
          address
        ),
      {
        cache:
          'no-store',
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * FETCH OBSERVER TOKENS
 * ============================================================
 *
 * Retrieves the current research pool/list.
 *
 * ============================================================
 */

export async function fetchObserverTokens(): Promise<
  ObserverTokenSummary[]
> {
  const response =
    await fetch(
      '/api/observer/tokens',
      {
        cache:
          'no-store',
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  const data =
    await response.json();

  /*
   * Accept either:
   *
   * [
   *   ...
   * ]
   *
   * or:
   *
   * {
   *   tokens: [...]
   * }
   */

  if (
    Array.isArray(data)
  ) {
    return data;
  }

  return Array.isArray(
    data?.tokens
  )
    ? data.tokens
    : [];
}

/*
 * ============================================================
 * FETCH OBSERVER RULES
 * ============================================================
 *
 * This allows the UI to display the actual rules
 * being used by the research engine.
 *
 * ============================================================
 */

export async function fetchObserverRules() {
  const response =
    await fetch(
      '/api/observer/rules',
      {
        cache:
          'no-store',
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * FETCH OBSERVER HEALTH
 * ============================================================
 */

export async function fetchObserverHealth() {
  const response =
    await fetch(
      '/api/observer/health',
      {
        cache:
          'no-store',
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * FETCH OBSERVER TIMEFRAME
 * ============================================================
 *
 * Retrieves one permanent timeframe result.
 *
 * No calculation occurs here.
 *
 * ============================================================
 */

export async function fetchObserverTimeframe(
  address: string,
  timeframeId: string
): Promise<
  TimeframeResult | null
> {
  const token =
    await fetchObserverToken(
      address
    );

  return (
    token.timeframeResults?.[
      timeframeId
    ] ?? null
  );
}

/*
 * ============================================================
 * FETCH OBSERVER EVIDENCE
 * ============================================================
 *
 * Convenience helper.
 *
 * Evidence comes directly from the
 * finalized research record.
 *
 * ============================================================
 */

export async function fetchObserverEvidence(
  address: string,
  timeframeId?: string
): Promise<
  ObserverEvidence[]
> {
  const token =
    await fetchObserverToken(
      address
    );

  /*
   * Specific timeframe requested.
   */

  if (
    timeframeId
  ) {
    const result =
      token.timeframeResults?.[
        timeframeId
      ];

    return (
      result?.observerEvidence ??
      []
    );
  }

  /*
   * Otherwise combine evidence from
   * all finalized timeframes.
   */

  const output:
    ObserverEvidence[] =
    [];

  for (
    const result of Object.values(
      token.timeframeResults ?? {}
    )
  ) {
    if (
      result.observerEvidence
    ) {
      output.push(
        ...result.observerEvidence
      );
    }
  }

  return output;
}

/*
 * ============================================================
 * FETCH OBSERVER PERFORMANCE
 * ============================================================
 *
 * Returns the permanent performance
 * information for a timeframe.
 *
 * ============================================================
 */

export async function fetchObserverPerformance(
  address: string,
  timeframeId?: string
): Promise<
  ObserverPerformance | null
> {
  const token =
    await fetchObserverToken(
      address
    );

  /*
   * Specific timeframe.
   */

  if (
    timeframeId
  ) {
    return (
      token
        .timeframeResults?.[
          timeframeId
        ]
        ?.observerPerformance ??
      null
    );
  }

  /*
   * If no timeframe was supplied,
   * use the most recent finalized
   * timeframe.
   */

  const results =
    Object.entries(
      token.timeframeResults ?? {}
    );

  for (
    let i =
      results.length - 1;
    i >= 0;
    i--
  ) {
    const result =
      results[i][1];

    if (
      result.status ===
        'FINALIZED' &&
      result.observerPerformance
    ) {
      return result.observerPerformance;
    }
  }

  return null;
}

/*
 * ============================================================
 * FETCH OBSERVER PATH
 * ============================================================
 *
 * PATH is historical research evidence.
 *
 * The frontend does not reconstruct it.
 *
 * ============================================================
 */

export async function fetchObserverPath(
  address: string
): Promise<
  string | null
> {
  const token =
    await fetchObserverToken(
      address
    );

  return token.path ??
    null;
}

/*
 * ============================================================
 * RUN OBSERVER TICK
 * ============================================================
 *
 * Tells the backend to perform one
 * research observation cycle.
 *
 * ============================================================
 */

export async function runObserverTick() {
  const response =
    await fetch(
      '/api/observer/tick',
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json',
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * TELEGRAM STATUS
 * ============================================================
 */

export async function fetchTelegramStatus() {
  const response =
    await fetch(
      '/api/telegram/status',
      {
        cache:
          'no-store',
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}

/*
 * ============================================================
 * TELEGRAM TEST
 * ============================================================
 *
 * Used only to verify the alert channel.
 *
 * ============================================================
 */

export async function testTelegram() {
  const response =
    await fetch(
      '/api/telegram/test',
      {
        method:
          'POST',
      }
    );

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  return response.json();
}
