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

  /*
   * ============================================================
   * OBSERVER RULE THRESHOLDS
   * ============================================================
   *
   * These values are configuration only.
   *
   * The research engine uses them to determine
   * observer evidence marks.
   *
   * They do NOT replace timeframe scoring,
   * timeframe grades, or PATH.
   *
   * ============================================================
   */

  rules: {
    buyPressureRatio: number;
    balancedLow: number;
    balancedHigh: number;

    mcAccelerationPct: number;

    volumeSpikeMultiple: number;
    volumeSustainedMultiple: number;
    volumeDecayMultiple: number;

    liquiditySpikeMultiple: number;
    liquidityStablePct: number;

    largeBuyUsd: number;
    largeBuyMultiple: number;
  };

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

/*
 * ============================================================
 * OBSERVER EVIDENCE
 * ============================================================
 */

export type ObserverMark =
  | "MC_RISING"
  | "MC_FALLING"
  | "NEW_MC_HIGH"
  | "MC_ACCELERATION"

  | "BUY_PRESSURE"
  | "SELL_PRESSURE"
  | "BUY_SELL_BALANCED"
  | "BUY_ACTIVITY_CHANGE"

  | "VOLUME_RISING"
  | "VOLUME_FALLING"
  | "VOLUME_SPIKE"
  | "VOLUME_SUSTAINED"
  | "VOLUME_DECAY"

  | "LIQUIDITY_RISING"
  | "LIQUIDITY_FALLING"
  | "LIQUIDITY_SPIKE"
  | "LIQUIDITY_STABLE"
  | "LIQUIDITY_RETENTION"

  | "EARLY_PEAK"
  | "SUSTAINED"
  | "COLLAPSE"
  | "FLAT";

export interface ObserverEvidence {
  mark: ObserverMark;
  value: number | null;
  reference: number | null;
  evidence: string;
}

export interface ObserverPerformance {
  entryMarketCap: number | null;
  peakMarketCap: number | null;
  peakLiquidity: number | null;
  peakVolume: number | null;

  athMultiple: number | null;
  athPercent: number | null;
  timeToAthMinutes: number | null;

  finalMarketCap: number | null;
}

/*
 * ============================================================
 * OBSERVATION
 * ============================================================
 */

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

  /*
   * ADDITIVE OBSERVER DATA
   */

  observerEvidence: ObserverEvidence[];

  observerPerformance: ObserverPerformance;
}

/*
 * ============================================================
 * SCORE RESULT
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
 */

export type TimeframeResultStatus =
  | "FINALIZED"
  | "NOT_OBSERVED";

export interface TimeframeResult {
  status: TimeframeResultStatus;

  passed: number | null;
  total: number | null;
  required: number | null;
  qualified: boolean | null;

  grade:
    | "A"
    | "B"
    | "C"
    | "D"
    | null;

  finalizedAt: number | null;

  /*
   * ADDITIVE OBSERVER DATA
   */

  observerEvidence?: ObserverEvidence[];

  observerPerformance?: ObserverPerformance;
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