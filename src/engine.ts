import type {
  AppConfig,
  Observation,
  PairSnapshot,
  RuleConfig,
  ScoreResult,
  TimeframeConfig,
  TimeframeResult,
  TokenRecord,
} from "./types";

/*
 * ============================================================
 * GROWTH
 * ============================================================
 *
 * Growth is measured against a stable baseline.
 *
 * Example:
 *
 * baseline MC = 100,000
 * current MC  = 150,000
 *
 * growth = +50%
 */

export const growth = (
  current: number | null,
  baseline: number | null
): number | null => {
  if (
    current === null ||
    baseline === null ||
    baseline === 0
  ) {
    return null;
  }

  return (
    ((current - baseline) / baseline) *
    100
  );
};

/*
 * ============================================================
 * PULLBACK
 * ============================================================
 *
 * Pullback is measured from the highest observed value.
 */

export const pullback = (
  current: number | null,
  peak: number | null
): number | null => {
  if (
    current === null ||
    peak === null ||
    peak === 0
  ) {
    return null;
  }

  return (
    ((current - peak) / peak) *
    100
  );
};

/*
 * ============================================================
 * TIMEFRAME
 * ============================================================
 */

export const timeframeForAge = (
  age: number,
  frames: TimeframeConfig[]
): TimeframeConfig | null => {
  return (
    frames.find(
      frame =>
        age >= frame.start_minute &&
        age < frame.end_minute
    ) ?? null
  );
};

/*
 * ============================================================
 * RULE COMPARISON
 * ============================================================
 */

export const compare = (
  actual: number | null,
  rule: RuleConfig
): boolean | null => {
  if (actual === null) {
    return null;
  }

  return rule.operator === ">="
    ? actual >= rule.value
    : actual <= rule.value;
};

/*
 * ============================================================
 * TIMEFRAME SCORE
 * ============================================================
 *
 * Score is evidence.
 *
 * It NEVER removes a token from the pool.
 */

export function score(
  observation: Observation,
  rules: RuleConfig[],
  required: number
): ScoreResult {
  const enabled =
    rules.filter(
      rule => rule.enabled
    );

  const passed =
    enabled.reduce(
      (count, rule) => {
        const actual =
          (observation as any)[
            rule.metric
          ];

        return (
          count +
          (
            compare(
              actual,
              rule
            ) === true
              ? 1
              : 0
          )
        );
      },
      0
    );

  return {
    passed,
    total:
      enabled.length,
    required,
    qualified:
      enabled.length > 0 &&
      passed >= required,
  };
}

/*
 * ============================================================
 * TIMEFRAME GRADE
 * ============================================================
 *
 * The grade is derived from the FINAL score.
 *
 * 5/5 = A
 * 4/5 = B
 * 3/5 = C
 * 2/5 = D
 *
 * 0/5 and 1/5 have no research grade.
 *
 * IMPORTANT:
 *
 * This function is called only when a timeframe
 * is being permanently finalized.
 *
 * ============================================================
 */

export function timeframeGrade(
  passed: number,
  total: number
):
  | "A"
  | "B"
  | "C"
  | "D"
  | null {
  if (total !== 5) {
    return null;
  }

  if (passed === 5) {
    return "A";
  }

  if (passed === 4) {
    return "B";
  }

  if (passed === 3) {
    return "C";
  }

  if (passed === 2) {
    return "D";
  }

  return null;
}

/*
 * ============================================================
 * ENTRY SCORE
 * ============================================================
 */

export function entryScore(
  snapshot: PairSnapshot,
  rules: RuleConfig[],
  required: number
): ScoreResult {
  const enabled =
    rules.filter(
      rule => rule.enabled
    );

  const passed =
    enabled.reduce(
      (count, rule) => {
        const actual =
          (snapshot as any)[
            rule.metric
          ];

        return (
          count +
          (
            compare(
              actual,
              rule
            ) === true
              ? 1
              : 0
          )
        );
      },
      0
    );

  return {
    passed,
    total:
      enabled.length,
    required,
    qualified:
      enabled.length > 0 &&
      passed >= required,
  };
}

/*
 * ============================================================
 * ENTRY PASS
 * ============================================================
 */

export function entryPass(
  snapshot: PairSnapshot,
  rules: RuleConfig[],
  required: number
): boolean {
  return entryScore(
    snapshot,
    rules,
    required
  ).qualified;
}

/*
 * ============================================================
 * FIND STABLE BASELINE
 * ============================================================
 */

function findBaseline(
  observations: Observation[]
): Observation | null {
  for (
    const observation of observations
  ) {
    const hasMarketCap =
      observation.marketCap !== null;

    const hasLiquidity =
      observation.liquidityUsd !== null;

    const hasVolume =
      observation.volume !== null;

    if (
      hasMarketCap ||
      hasLiquidity ||
      hasVolume
    ) {
      return observation;
    }
  }

  return null;
}

/*
 * ============================================================
 * PEAK VALUES
 * ============================================================
 */

function calculatePeaks(
  previous: Observation | null,
  snapshot: PairSnapshot
) {
  const previousMarketCap =
    previous?.peakMarketCap ??
    null;

  const previousLiquidity =
    previous?.peakLiquidity ??
    null;

  const previousVolume =
    previous?.peakVolume ??
    null;

  const marketCapValues =
    [
      previousMarketCap,
      snapshot.marketCap,
    ].filter(
      (
        value
      ): value is number =>
        value !== null
    );

  const liquidityValues =
    [
      previousLiquidity,
      snapshot.liquidityUsd,
    ].filter(
      (
        value
      ): value is number =>
        value !== null
    );

  const volumeValues =
    [
      previousVolume,
      snapshot.volume,
    ].filter(
      (
        value
      ): value is number =>
        value !== null
    );

  return {
    marketCap:
      marketCapValues.length > 0
        ? Math.max(
            ...marketCapValues
          )
        : null,

    liquidity:
      liquidityValues.length > 0
        ? Math.max(
            ...liquidityValues
          )
        : null,

    volume:
      volumeValues.length > 0
        ? Math.max(
            ...volumeValues
          )
        : null,
  };
}

/*
 * ============================================================
 * MAKE OBSERVATION
 * ============================================================
 */

export function makeObservation(
  snapshot: PairSnapshot,
  previous: Observation | null,
  baseline: Observation | null,
  config: AppConfig
): Observation {
  /*
   * AGE
   */

  const age =
    snapshot.pairCreatedAt ===
    null
      ? 0
      : Math.max(
          0,
          (
            snapshot.fetchedAt -
            snapshot.pairCreatedAt
          ) /
            60000
        );

  /*
   * PEAKS
   */

  const peaks =
    calculatePeaks(
      previous,
      snapshot
    );

  /*
   * PULLBACK
   */

  const mcPullback =
    pullback(
      snapshot.marketCap,
      peaks.marketCap
    );

  const liqPullback =
    pullback(
      snapshot.liquidityUsd,
      peaks.liquidity
    );

  /*
   * GROWTH
   */

  const mcGrowth =
    growth(
      snapshot.marketCap,
      baseline?.marketCap ??
        null
    );

  const liquidityGrowth =
    growth(
      snapshot.liquidityUsd,
      baseline?.liquidityUsd ??
        null
    );

  const volumeGrowth =
    growth(
      snapshot.volume,
      baseline?.volume ??
        null
    );

  /*
   * CURRENT TIMEFRAME
   */

  const timeframe =
    timeframeForAge(
      age,
      config.timeframes
    );

  /*
   * OBSERVATION
   */

  return {
    ...snapshot,

    ageMinutes:
      age,

    mcGrowth,

    liquidityGrowth,

    volumeGrowth,

    mcPullback,

    liquidityPullback:
      liqPullback,

    mcPullbackAbs:
      mcPullback === null
        ? null
        : Math.abs(
            mcPullback
          ),

    liquidityPullbackAbs:
      liqPullback === null
        ? null
        : Math.abs(
            liqPullback
          ),

    peakMarketCap:
      peaks.marketCap,

    peakLiquidity:
      peaks.liquidity,

    peakVolume:
      peaks.volume,

    timeframeId:
      timeframe?.id ??
      "outside",
  };
}

/*
 * ============================================================
 * CREATE FINALIZED TIMEFRAME RESULT
 * ============================================================
 */

function finalizeTimeframe(
  observation: Observation,
  timeframe: TimeframeConfig,
  finalizedAt: number
): TimeframeResult {
  const result =
    score(
      observation,
      timeframe.rules,
      timeframe.required_score
    );

  return {
    status:
      "FINALIZED",

    passed:
      result.passed,

    total:
      result.total,

    required:
      result.required,

    qualified:
      result.qualified,

    grade:
      timeframeGrade(
        result.passed,
        result.total
      ),

    finalizedAt,
  };
}

/*
 * ============================================================
 * MARK PREVIOUS TIMEFRAMES AS NOT OBSERVED
 * ============================================================
 *
 * This happens ONLY when we first observe a token
 * after one or more research windows have already passed.
 *
 * Example:
 *
 * Token first enters at 27m.
 *
 * 10–15m = NOT_OBSERVED
 * 20–30m = currently being observed
 *
 * We never invent grades for the first two windows.
 *
 * ============================================================
 */

function markEarlierTimeframesNotObserved(
  existing:
    Record<
      string,
      TimeframeResult
    >,
  currentTimeframe:
    TimeframeConfig,
  frames:
    TimeframeConfig[]
) {
  const next = {
    ...existing,
  };

  for (
    const frame of frames
  ) {
    if (
      frame.id ===
      currentTimeframe.id
    ) {
      break;
    }

    /*
     * Never overwrite an existing
     * permanent result.
     */

    if (
      next[frame.id]
    ) {
      continue;
    }

    next[frame.id] = {
      status:
        "NOT_OBSERVED",

      passed:
        null,

      total:
        null,

      required:
        null,

      qualified:
        null,

      grade:
        null,

      finalizedAt:
        null,
    };
  }

  return next;
}

/*
 * ============================================================
 * PROCESS TOKEN
 * ============================================================
 *
 * IMPORTANT:
 *
 * A timeframe is finalized exactly once.
 *
 * Once FINALIZED:
 *
 * - score cannot change
 * - grade cannot change
 * - finalizedAt cannot change
 *
 * A token entering late gets permanent
 * NOT_OBSERVED records for earlier windows.
 *
 * No historical score is invented.
 *
 * ============================================================
 */

export function process(
  record: TokenRecord,
  snapshot: PairSnapshot,
  config: AppConfig
): TokenRecord {
  /*
   * Previous observation.
   */

  const previous =
    record.observations.at(
      -1
    ) ?? null;

  /*
   * Stable baseline.
   */

  const baseline =
    findBaseline(
      record.observations
    );

  /*
   * Create observation.
   */

  const observation =
    makeObservation(
      snapshot,
      previous,
      baseline,
      config
    );

  /*
   * Add observation.
   */

  const observations = [
    ...record.observations,
    observation,
  ];

  /*
   * Start with existing permanent
   * research history.
   */

  let timeframeResults = {
    ...record.timeframeResults,
  };

  /*
   * ==========================================================
   * CURRENT TIMEFRAME
   * ==========================================================
   */

  const currentTimeframe =
    config.timeframes.find(
      frame =>
        frame.id ===
        observation.timeframeId
    ) ?? null;

  /*
   * ==========================================================
   * FIRST OBSERVATION / LATE ENTRY
   * ==========================================================
   *
   * If this is the first meaningful observation,
   * permanently mark every earlier timeframe
   * as NOT_OBSERVED.
   * ==========================================================
   */

  if (
    currentTimeframe &&
    record.observations.length === 0
  ) {
    timeframeResults =
      markEarlierTimeframesNotObserved(
        timeframeResults,
        currentTimeframe,
        config.timeframes
      );
  }

  /*
   * ==========================================================
   * TIMEFRAME TRANSITION
   * ==========================================================
   *
   * If we moved from one timeframe into another,
   * the previous timeframe is now finished.
   *
   * We finalize it using the LAST observation
   * that actually belonged to that timeframe.
   * ==========================================================
   */

  if (
    previous &&
    previous.timeframeId !==
      observation.timeframeId
  ) {
    const previousTimeframe =
      config.timeframes.find(
        frame =>
          frame.id ===
          previous.timeframeId
      );

    /*
     * Only finalize if:
     *
     * - previous timeframe is real
     * - previous timeframe has not already
     *   been finalized
     */

    if (
      previousTimeframe &&
      !timeframeResults[
        previousTimeframe.id
      ]
    ) {
      timeframeResults[
        previousTimeframe.id
      ] =
        finalizeTimeframe(
          previous,
          previousTimeframe,
          observation.fetchedAt
        );
    }
  }

  /*
   * ==========================================================
   * EXPIRATION
   * ==========================================================
   *
   * If maximum research age has been reached,
   * finalize the last observed timeframe before
   * marking the token EXPIRED.
   * ==========================================================
   */

  const expired =
    observation.ageMinutes >=
    config.pool
      .maximum_research_minutes;

  if (
    expired &&
    previous &&
    previous.timeframeId !==
      "outside"
  ) {
    const lastTimeframe =
      config.timeframes.find(
        frame =>
          frame.id ===
          previous.timeframeId
      );

    if (
      lastTimeframe &&
      !timeframeResults[
        lastTimeframe.id
      ]
    ) {
      timeframeResults[
        lastTimeframe.id
      ] =
        finalizeTimeframe(
          previous,
          lastTimeframe,
          observation.fetchedAt
        );
    }
  }

  /*
   * ==========================================================
   * CREATE NEXT RECORD
   * ==========================================================
   */

  const next: TokenRecord = {
    ...record,

    observations,

    timeframeResults,

    currentTimeframeId:
      observation.timeframeId,

    status:
      expired
        ? "EXPIRED"
        : "ACTIVE",
  };

  return next;
}