export type Operator =
  ">=" | "<=";

export interface RuleConfig {
  id: string;
  label: string;
  metric: string;
  operator: Operator;
  value: number;
  enabled: boolean;
}

export interface TimeframeConfig {
  id: string;
  label: string;
  start_minute: number;
  end_minute: number;
  required_score: number;
  rules: RuleConfig[];
}

export interface AppConfig {
  pool: {
    polling_interval_seconds: number;
    maximum_research_minutes: number;
    entry_required_score: number;
    discovery_endpoint: string;
    chain: string;
    max_candidates_per_poll: number;
  };

  entry_rules: RuleConfig[];

  timeframes: TimeframeConfig[];
}

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

export interface PairSnapshot {
  tokenAddress: string;
  pairAddress: string;
  dexId: string;
  pairCreatedAt: number | null;
  fetchedAt: number;

  priceUsd: number | null;
  marketCap: number | null;
  fdv?: number | null;
  liquidityUsd: number | null;
  volume: number | null;

  buys: number | null;
  sells: number | null;
  txns: number | null;

  volumeMcRatio: number | null;
}

export interface Observation
  extends PairSnapshot {
  ageMinutes: number;

  mcGrowth: number | null;
  liquidityGrowth: number | null;
  volumeGrowth: number | null;

  mcPullback: number | null;
  liquidityPullback: number | null;

  mcPullbackAbs: number | null;
  liquidityPullbackAbs: number | null;

  peakMarketCap: number | null;
  peakLiquidity: number | null;
  peakVolume: number | null;

  timeframeId: string;
}

/*
 * ============================================================
 * SCORE RESULT
 * ============================================================
 *
 * Kept unchanged for entry scoring and compatibility.
 *
 * ============================================================
 */

export interface ScoreResult {
  passed: number;
  total: number;
  required: number;
  qualified: boolean;
}

/*
 * ============================================================
 * PERMANENT TIMEFRAME RESULT
 * ============================================================
 *
 * This is different from a normal ScoreResult.
 *
 * A timeframe can have one of two permanent states:
 *
 * FINALIZED
 *     We actually observed the token during the timeframe
 *     and finalized its research result.
 *
 * NOT_OBSERVED
 *     The token entered after this timeframe had already
 *     passed, so we have no evidence for that timeframe.
 *
 * IMPORTANT:
 *
 * We never invent a score for NOT_OBSERVED.
 *
 * ============================================================
 */

export type TimeframeResultStatus =
  | "FINALIZED"
  | "NOT_OBSERVED";

export interface TimeframeResult {
  status: TimeframeResultStatus;

  /*
   * Score information.
   *
   * For FINALIZED:
   *
   * passed / total / required / qualified
   * contain the actual research result.
   *
   * For NOT_OBSERVED:
   *
   * these values are null.
   */

  passed: number | null;
  total: number | null;
  required: number | null;
  qualified: boolean | null;

  /*
   * A/B/C/D is assigned ONLY when FINALIZED.
   */

  grade:
    | "A"
    | "B"
    | "C"
    | "D"
    | null;

  /*
   * When this research timeframe became
   * permanently finalized.
   *
   * null for NOT_OBSERVED.
   */

  finalizedAt: number | null;
}

/*
 * ============================================================
 * TOKEN RECORD
 * ============================================================
 */

export interface TokenRecord {
  tokenAddress: string;
  pairAddress: string;
  dexId: string;

  firstSeenAt: number;

  discoverySources: string[];

  entryScore: ScoreResult | null;

  observations: Observation[];

  /*
   * ==========================================================
   * PERMANENT RESEARCH EVIDENCE
   * ==========================================================
   *
   * IMPORTANT:
   *
   * A timeframe is inserted here only when:
   *
   * 1. It has been permanently finalized, OR
   * 2. It is permanently known to be NOT_OBSERVED.
   *
   * Future timeframes do not appear until researched.
   *
   * ==========================================================
   */

  timeframeResults:
    Record<
      string,
      TimeframeResult
    >;

  status:
    | "ACTIVE"
    | "EXPIRED";

  currentTimeframeId: string;
}