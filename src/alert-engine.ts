/*
 * ============================================================
 * CHAINSCOPE TELEGRAM ALERT ENGINE
 * ============================================================
 *
 * This file reports finalized research.
 *
 * It does NOT:
 *
 * - calculate timeframe grades
 * - calculate PATH
 * - invent missing timeframe results
 * - backfill old timeframes
 * - modify finalized research
 *
 * The research engine remains responsible for:
 *
 * - observation
 * - timeframe finalization
 * - grade
 * - permanent PATH
 * - observer evidence
 * - observer performance
 *
 * This file only formats and sends the result.
 *
 * ============================================================
 */

import type {
  ObserverEvidence,
  ObserverPerformance,
} from "./types";

/*
 * ============================================================
 * TELEGRAM PAYLOAD
 * ============================================================
 */

export interface TelegramAlertPayload {
  message: string;
  ca?: string | null;
}

/*
 * ============================================================
 * SEND TELEGRAM ALERT
 * ============================================================
 */

export async function sendTelegramAlert(
  payload: TelegramAlertPayload
): Promise<void> {
  const response =
    await fetch(
      "/api/telegram/alert",
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            message:
              payload.message,

            /*
             * FULL CA.
             *
             * The server uses this to create
             * Telegram's COPY CA button.
             */

            ca:
              payload.ca ??
              null,
          }),
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      text ||
        `Telegram alert failed with HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (!data?.ok) {
    throw new Error(
      data?.error ||
        "Telegram alert failed"
    );
  }
}

/*
 * ============================================================
 * FORMAT NUMBER
 * ============================================================
 */

function numberValue(
  value: number | null | undefined,
  decimals = 2
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(decimals);
}

/*
 * ============================================================
 * FORMAT MONEY
 * ============================================================
 */

function money(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `$${value.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2,
    }
  )}`;
}

/*
 * ============================================================
 * FORMAT OBSERVER EVIDENCE
 * ============================================================
 *
 * IMPORTANT:
 *
 * Evidence is displayed exactly as evidence.
 *
 * No new scoring is performed here.
 *
 * ============================================================
 */

function formatEvidence(
  evidence:
    | ObserverEvidence[]
    | undefined
): string[] {
  if (
    !evidence ||
    evidence.length === 0
  ) {
    return [
      "No observer evidence",
    ];
  }

  return evidence.map(
    item =>
      `✓ ${item.mark}${
        item.evidence
          ? ` — ${item.evidence}`
          : ""
      }`
  );
}

/*
 * ============================================================
 * FORMAT OBSERVER PERFORMANCE
 * ============================================================
 */

function formatPerformance(
  performance:
    | ObserverPerformance
    | undefined
): string[] {
  if (!performance) {
    return [
      `Entry MC`,
      `Peak MC`,
      `Peak liquidity`,
      `Peak volume`,
      `ATH multiple`,
      `ATH %`,
      `Time to ATH`,
      `Final MC`,
    ];
  }

  return [
    `Entry MC: ${money(
      performance.entryMarketCap
    )}`,

    `Peak MC: ${money(
      performance.peakMarketCap
    )}`,

    `Peak liquidity: ${money(
      performance.peakLiquidity
    )}`,

    `Peak volume: ${money(
      performance.peakVolume
    )}`,

    `ATH multiple: ${
      performance.athMultiple === null
        ? "—"
        : `${numberValue(
            performance.athMultiple,
            2
          )}x`
    }`,

    `ATH %: ${
      performance.athPercent === null
        ? "—"
        : `${numberValue(
            performance.athPercent,
            2
          )}%`
    }`,

    `Time to ATH: ${
      performance.timeToAthMinutes === null
        ? "—"
        : `${numberValue(
            performance.timeToAthMinutes,
            2
          )}m`
    }`,

    `Final MC: ${money(
      performance.finalMarketCap
    )}`,
  ];
}

/*
 * ============================================================
 * BUILD FINALIZED TIMEFRAME ALERT
 * ============================================================
 *
 * Grade and PATH are supplied by the permanent
 * research record.
 *
 * This function does NOT calculate them.
 *
 * ============================================================
 */

export function buildTimeframeAlert(
  tokenAddress: string,
  tokenSymbol: string | null,
  timeframeId: string,
  passed: number,
  total: number,
  grade: string | null,
  path: string | null,
  evidence:
    | ObserverEvidence[]
    | undefined,
  performance:
    | ObserverPerformance
    | undefined,
  entryPassed?: number,
  entryTotal?: number,
  researchAge?: number
): string {
  const symbol =
    tokenSymbol
      ? `$${tokenSymbol}`
      : tokenAddress;

  const entry =
    entryPassed !== undefined &&
    entryTotal !== undefined
      ? `${entryPassed}/${entryTotal}`
      : "—";

  const evidenceLines =
    formatEvidence(
      evidence
    );

  const performanceLines =
    formatPerformance(
      performance
    );

  return [
    "🔬 ChainScope Research Alert",

    "",

    `Token: ${symbol}`,

    `CA: ${tokenAddress}`,

    "",

    "Entry",

    entry,

    "",

    "Timeframe",

    timeframeId,

    "",

    "Score",

    `${passed}/${total}`,

    "",

    "Grade",

    grade ?? "—",

    "",

    "PATH",

    path ?? "—",

    "",

    "Evidence",

    ...evidenceLines,

    "",

    "Performance",

    ...performanceLines,

    "",

    "Research Age",

    researchAge ===
      undefined
      ? "—"
      : `${numberValue(
          researchAge,
          1
        )}m`,
  ].join("\n");
}

/*
 * ============================================================
 * SEND FINALIZED TIMEFRAME ALERT
 * ============================================================
 *
 * Reports ONE finalized timeframe.
 *
 * Example:
 *
 * 🔬 ChainScope Research Alert
 *
 * Token: $SYMBOL
 * CA: FULL ADDRESS
 *
 * Entry
 * 4/6
 *
 * Timeframe
 * 30–40m
 *
 * Score
 * 4/5
 *
 * Grade
 * A
 *
 * PATH
 * B → A → A → B
 *
 * Evidence
 * ✓ MC_RISING — MC Growth=31.42%
 * ✓ LIQUIDITY_RISING — Liquidity Growth=8.17%
 *
 * Performance
 * Entry MC: $...
 * Peak MC: $...
 * ...
 *
 * Research Age
 * 34.2m
 *
 * ============================================================
 */

export async function sendTimeframeAlert(
  tokenAddress: string,
  timeframeId: string,
  passed: number,
  total: number,
  grade: string | null,
  path: string | null,
  evidence:
    | ObserverEvidence[]
    | undefined,
  performance:
    | ObserverPerformance
    | undefined,
  tokenSymbol: string | null = null,
  entryPassed?: number,
  entryTotal?: number,
  researchAge?: number
): Promise<void> {
  /*
   * DO NOT calculate grade.
   *
   * DO NOT calculate PATH.
   *
   * Both must already be finalized
   * by the research engine.
   */

  const message =
    buildTimeframeAlert(
      tokenAddress,
      tokenSymbol,
      timeframeId,
      passed,
      total,
      grade,
      path,
      evidence,
      performance,
      entryPassed,
      entryTotal,
      researchAge
    );

  await sendTelegramAlert({
    message,

    /*
     * FULL TOKEN CA.
     *
     * Never shorten this.
     *
     * The server uses it for:
     *
     * 📋 COPY CA
     */

    ca:
      tokenAddress,
  });
}