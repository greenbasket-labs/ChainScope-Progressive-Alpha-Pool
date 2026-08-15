import type {
  AppConfig,
  Observation,
  ObserverEvidence,
  ObserverMark,
  ObserverPerformance,
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
 * EXISTING LOGIC — PRESERVED
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
 * EXISTING LOGIC — PRESERVED
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
 *
 * EXISTING LOGIC — PRESERVED
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
 * OBSERVER HELPERS
 * ============================================================
 *
 * ADDITIVE ONLY
 *
 * These functions produce evidence.
 *
 * They do NOT alter:
 *
 * - entry score
 * - timeframe score
 * - timeframe grade
 * - PATH
 * - permanent timeframe state
 *
 * ============================================================
 */

function observerNumber(
  value: number | null | undefined
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function observerRatio(
  current: number | null,
  previous: number | null
): number | null {
  if (
    current === null ||
    previous === null ||
    previous === 0
  ) {
    return null;
  }

  return current / previous;
}

function addObserverMark(
  evidence: ObserverEvidence[],
  mark: ObserverMark,
  value: number | null,
  reference: number | null,
  text: string
) {
  evidence.push({
    mark,
    value,
    reference,
    evidence: text,
  });
}

/*
 * ============================================================
 * BUILD OBSERVER EVIDENCE
 * ============================================================
 */

function buildObserverEvidence(
  snapshot: PairSnapshot,
  previous: Observation | null,
  baseline: Observation | null,
  peaks: {
    marketCap: number | null;
    liquidity: number | null;
    volume: number | null;
  },
  config: AppConfig
): ObserverEvidence[] {
  const evidence: ObserverEvidence[] = [];

  const currentMC =
    observerNumber(
      snapshot.marketCap
    );

  const previousMC =
    observerNumber(
      previous?.marketCap
    );

  const currentLiquidity =
    observerNumber(
      snapshot.liquidityUsd
    );

  const previousLiquidity =
    observerNumber(
      previous?.liquidityUsd
    );

  const currentVolume =
    observerNumber(
      snapshot.volume
    );

  const previousVolume =
    observerNumber(
      previous?.volume
    );

  /*
   * ==========================================================
   * MARKET CAP
   * ==========================================================
   */

  if (
    currentMC !== null &&
    previousMC !== null
  ) {
    if (currentMC > previousMC) {
      const pct =
        growth(
          currentMC,
          previousMC
        );

      addObserverMark(
        evidence,
        "MC_RISING",
        pct,
        0,
        `MC Growth=${pct?.toFixed(2)}%`
      );
    }

    if (currentMC < previousMC) {
      const pct =
        growth(
          currentMC,
          previousMC
        );

      addObserverMark(
        evidence,
        "MC_FALLING",
        pct,
        0,
        `MC Growth=${pct?.toFixed(2)}%`
      );
    }
  }

  if (
    currentMC !== null &&
    peaks.marketCap !== null &&
    currentMC >= peaks.marketCap
  ) {
    addObserverMark(
      evidence,
      "NEW_MC_HIGH",
      currentMC,
      peaks.marketCap,
      `MC=${currentMC}; previous peak=${peaks.marketCap}`
    );
  }

  if (
    currentMC !== null &&
    baseline !== null &&
    baseline.marketCap !== null
  ) {
    const mcGrowth =
      growth(
        currentMC,
        baseline.marketCap
      );

    const acceleration =
      config.rules.mcAccelerationPct;

    if (
      mcGrowth !== null &&
      mcGrowth >= acceleration
    ) {
      addObserverMark(
        evidence,
        "MC_ACCELERATION",
        mcGrowth,
        acceleration,
        `MC Growth=${mcGrowth.toFixed(2)}%`
      );
    }
  }

  /*
   * ==========================================================
   * BUY / SELL
   * ==========================================================
   */

  const buys =
    observerNumber(
      snapshot.buys
    );

  const sells =
    observerNumber(
      snapshot.sells
    );

  const previousBuys =
    observerNumber(
      previous?.buys
    );

  if (
    buys !== null &&
    sells !== null &&
    sells > 0
  ) {
    const ratio =
      buys / sells;

    if (
      ratio >=
      config.rules.buyPressureRatio
    ) {
      addObserverMark(
        evidence,
        "BUY_PRESSURE",
        ratio,
        config.rules.buyPressureRatio,
        `Buy/Sell ratio=${ratio.toFixed(3)}`
      );
    }

    if (
      ratio <=
      1 /
        config.rules.buyPressureRatio
    ) {
      addObserverMark(
        evidence,
        "SELL_PRESSURE",
        ratio,
        1 /
          config.rules.buyPressureRatio,
        `Buy/Sell ratio=${ratio.toFixed(3)}`
      );
    }

    if (
      ratio >=
        config.rules.balancedLow &&
      ratio <=
        config.rules.balancedHigh
    ) {
      addObserverMark(
        evidence,
        "BUY_SELL_BALANCED",
        ratio,
        1,
        `Buy/Sell ratio=${ratio.toFixed(3)}`
      );
    }
  }

  if (
    buys !== null &&
    previousBuys !== null &&
    buys !== previousBuys
  ) {
    addObserverMark(
      evidence,
      "BUY_ACTIVITY_CHANGE",
      buys - previousBuys,
      previousBuys,
      `Buys=${previousBuys} → ${buys}`
    );
  }

  /*
   * ==========================================================
   * VOLUME
   * ==========================================================
   */

  if (
    currentVolume !== null &&
    previousVolume !== null
  ) {
    const volumePct =
      growth(
        currentVolume,
        previousVolume
      );

    const volumeRatio =
      observerRatio(
        currentVolume,
        previousVolume
      );

    if (
      volumePct !== null &&
      volumePct > 0
    ) {
      addObserverMark(
        evidence,
        "VOLUME_RISING",
        volumePct,
        0,
        `Volume Growth=${volumePct.toFixed(2)}%`
      );
    }

    if (
      volumePct !== null &&
      volumePct < 0
    ) {
      addObserverMark(
        evidence,
        "VOLUME_FALLING",
        volumePct,
        0,
        `Volume Growth=${volumePct.toFixed(2)}%`
      );
    }

    if (
      volumeRatio !== null &&
      volumeRatio >=
        config.rules.volumeSpikeMultiple
    ) {
      addObserverMark(
        evidence,
        "VOLUME_SPIKE",
        volumeRatio,
        config.rules.volumeSpikeMultiple,
        `Volume ratio=${volumeRatio.toFixed(3)}`
      );
    } else if (
      volumeRatio !== null &&
      volumeRatio >=
        config.rules.volumeSustainedMultiple
    ) {
      addObserverMark(
        evidence,
        "VOLUME_SUSTAINED",
        volumeRatio,
        config.rules.volumeSustainedMultiple,
        `Volume ratio=${volumeRatio.toFixed(3)}`
      );
    } else if (
      volumeRatio !== null &&
      volumeRatio <=
        config.rules.volumeDecayMultiple
    ) {
      addObserverMark(
        evidence,
        "VOLUME_DECAY",
        volumeRatio,
        config.rules.volumeDecayMultiple,
        `Volume ratio=${volumeRatio.toFixed(3)}`
      );
    }
  }

  /*
   * ==========================================================
   * LIQUIDITY
   * ==========================================================
   */

  if (
    currentLiquidity !== null &&
    previousLiquidity !== null
  ) {
    const liquidityPct =
      growth(
        currentLiquidity,
        previousLiquidity
      );

    const liquidityRatio =
      observerRatio(
        currentLiquidity,
        previousLiquidity
      );

    if (
      liquidityPct !== null &&
      liquidityPct > 0
    ) {
      addObserverMark(
        evidence,
        "LIQUIDITY_RISING",
        liquidityPct,
        0,
        `Liquidity Growth=${liquidityPct.toFixed(2)}%`
      );
    }

    if (
      liquidityPct !== null &&
      liquidityPct < 0
    ) {
      addObserverMark(
        evidence,
        "LIQUIDITY_FALLING",
        liquidityPct,
        0,
        `Liquidity Growth=${liquidityPct.toFixed(2)}%`
      );
    }

    if (
      liquidityRatio !== null &&
      liquidityRatio >=
        config.rules.liquiditySpikeMultiple
    ) {
      addObserverMark(
        evidence,
        "LIQUIDITY_SPIKE",
        liquidityRatio,
        config.rules.liquiditySpikeMultiple,
        `Liquidity ratio=${liquidityRatio.toFixed(3)}`
      );
    }

    if (
      liquidityPct !== null &&
      Math.abs(liquidityPct) <=
        config.rules.liquidityStablePct
    ) {
      addObserverMark(
        evidence,
        "LIQUIDITY_STABLE",
        liquidityPct,
        config.rules.liquidityStablePct,
        `Liquidity change=${liquidityPct.toFixed(2)}%`
      );
    }

    if (
      liquidityRatio !== null &&
      liquidityRatio >= 0.95 &&
      liquidityRatio <= 1.05
    ) {
      addObserverMark(
        evidence,
        "LIQUIDITY_RETENTION",
        liquidityRatio,
        1,
        `Liquidity retained=${(
          liquidityRatio * 100
        ).toFixed(2)}%`
      );
    }
  }

  /*
   * ==========================================================
   * ACTIVITY STATE
   * ==========================================================
   */

  if (
    currentVolume !== null &&
    previousVolume !== null
  ) {
    const volumePct =
      growth(
        currentVolume,
        previousVolume
      );

    if (
      volumePct !== null &&
      volumePct <= -50
    ) {
      addObserverMark(
        evidence,
        "COLLAPSE",
        volumePct,
        -50,
        `Volume Growth=${volumePct.toFixed(2)}%`
      );
    } else if (
      volumePct !== null &&
      volumePct >= 50
    ) {
      addObserverMark(
        evidence,
        "EARLY_PEAK",
        volumePct,
        50,
        `Volume Growth=${volumePct.toFixed(2)}%`
      );
    } else if (
      volumePct !== null &&
      Math.abs(volumePct) < 10
    ) {
      addObserverMark(
        evidence,
        "FLAT",
        volumePct,
        10,
        `Volume Growth=${volumePct.toFixed(2)}%`
      );
    } else if (
      volumePct !== null
    ) {
      addObserverMark(
        evidence,
        "SUSTAINED",
        volumePct,
        10,
        `Volume Growth=${volumePct.toFixed(2)}%`
      );
    }
  }

  return evidence;
}

/*
 * ============================================================
 * OBSERVER PERFORMANCE
 * ============================================================
 *
 * ADDITIVE
 *
 * Uses the same observation history.
 * No separate market-data fetch is introduced here.
 *
 * ============================================================
 */

function calculateObserverPerformance(
  snapshot: PairSnapshot,
  previous: Observation | null,
  baseline: Observation | null,
  peaks: {
    marketCap: number | null;
    liquidity: number | null;
    volume: number | null;
  }
): ObserverPerformance {
  const entryMarketCap =
    observerNumber(
      baseline?.marketCap ??
      previous?.marketCap ??
      snapshot.marketCap
    );

  const peakMarketCap =
    peaks.marketCap;

  const athMultiple =
    entryMarketCap !== null &&
    entryMarketCap > 0 &&
    peakMarketCap !== null
      ? peakMarketCap /
        entryMarketCap
      : null;

  const athPercent =
    athMultiple !== null
      ? (
          athMultiple - 1
        ) * 100
      : null;

  let timeToAthMinutes:
    number | null = null;

  if (
    peakMarketCap !== null &&
    snapshot.marketCap !== null &&
    snapshot.fetchedAt !== null
  ) {
    const currentAge =
      snapshot.pairCreatedAt === null
        ? null
        : Math.max(
            0,
            (
              snapshot.fetchedAt -
              snapshot.pairCreatedAt
            ) / 60000
          );

    if (
      currentAge !== null &&
      peakMarketCap >=
        snapshot.marketCap
    ) {
      timeToAthMinutes =
        currentAge;
    }
  }

  return {
    entryMarketCap,
    peakMarketCap,
    peakLiquidity:
      peaks.liquidity,
    peakVolume:
      peaks.volume,
    athMultiple,
    athPercent,
    timeToAthMinutes,
    finalMarketCap:
      snapshot.marketCap,
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
   * ==========================================================
   * ADDITIVE OBSERVER LAYER
   * ==========================================================
   */

  const observerEvidence =
    buildObserverEvidence(
      snapshot,
      previous,
      baseline,
      peaks,
      config
    );

  const observerPerformance =
    calculateObserverPerformance(
      snapshot,
      previous,
      baseline,
      peaks
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

    /*
     * NEW — Observer evidence
     */

    observerEvidence,

    /*
     * NEW — Observer performance
     */

    observerPerformance,
  };
}

/*
 * ============================================================
 * CREATE FINALIZED TIMEFRAME RESULT
 * ============================================================
 *
 * EXISTING SCORE / GRADE LOGIC PRESERVED.
 *
 * Observer evidence is added alongside it.
 *
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

    /*
     * ADDITIVE OBSERVER DATA
     */

    observerEvidence:
      observation.observerEvidence,

    observerPerformance:
      observation.observerPerformance,
  };
}

/*
 * ============================================================
 * MARK PREVIOUS TIMEFRAMES AS NOT OBSERVED
 * ============================================================
 *
 * EXISTING LOGIC — PRESERVED
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
 * EXISTING PERMANENT TIMEFRAME LOGIC — PRESERVED
 *
 * Observer data is carried through the same observation
 * and finalized timeframe record.
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