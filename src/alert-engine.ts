/*
 * ============================================================
 * CHAINSCOPE TELEGRAM ALERT ENGINE
 * ============================================================
 *
 * Frontend alert helper.
 *
 * IMPORTANT:
 *
 * This file does NOT:
 *
 * - calculate timeframe grades
 * - invent missing timeframe grades
 * - backfill old timeframes
 * - change finalized research
 * - recalculate the historical PATH
 * - contain Express
 * - contain Telegram bot token
 * - contain Telegram chat ID
 *
 * The research engine is responsible for:
 *
 * 1. Observing the token
 * 2. Finalizing each timeframe
 * 3. Permanently storing its grade
 * 4. Building the permanent research journey
 *
 * This file ONLY reports the finalized result.
 *
 * ============================================================
 *
 * SERVER:
 *
 * POST /api/telegram/alert
 *
 * Body:
 *
 * {
 *   message: "...",
 *   ca: "FULL TOKEN ADDRESS"
 * }
 *
 * The server creates the Telegram:
 *
 * 📋 COPY CA
 *
 * ============================================================
 */

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
      '/api/telegram/alert',
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/json',
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
        'Telegram alert failed'
    );
  }
}

/*
 * ============================================================
 * BUILD FINALIZED TIMEFRAME ALERT
 * ============================================================
 *
 * IMPORTANT:
 *
 * `grade` MUST come from the finalized research record.
 *
 * `path` MUST come from the permanent research journey.
 *
 * This function does NOT calculate either one.
 *
 * ============================================================
 */

export function buildTimeframeAlert(
  tokenAddress: string,
  timeframeId: string,
  passed: number,
  total: number,
  grade: string | null,
  path: string | null,
  entryPassed?: number,
  entryTotal?: number
): string {
  return [
    '🚨 ChainScope Timeframe Alert',

    '',

    `Token: ${tokenAddress}`,

    `Timeframe: ${timeframeId}`,

    `Score: ${passed}/${total}`,

    `Grade: ${
      grade ??
      '—'
    }`,

    '',

    `PATH: ${
      path ??
      '—'
    }`,

    '',

    `Entry grade: ${
      entryPassed !== undefined &&
      entryTotal !== undefined
        ? `${entryPassed}/${entryTotal}`
        : '—'
    }`,

    '',

    `Time: ${new Date().toLocaleString()}`,
  ].join('\n');
}

/*
 * ============================================================
 * SEND FINALIZED TIMEFRAME ALERT
 * ============================================================
 *
 * This function reports ONE finalized timeframe.
 *
 * Example:
 *
 * Timeframe: 30–40m
 * Score: 5/5
 * Grade: A
 *
 * PATH:
 * A → B → A
 *
 * The PATH is historical evidence already produced
 * by the research engine.
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
  entryPassed?: number,
  entryTotal?: number
): Promise<void> {
  /*
   * Do not calculate grade here.
   *
   * Do not calculate path here.
   *
   * They must already be finalized by
   * the research engine.
   */

  const message =
    buildTimeframeAlert(
      tokenAddress,
      timeframeId,
      passed,
      total,
      grade,
      path,
      entryPassed,
      entryTotal
    );

  await sendTelegramAlert({
    message,

    /*
     * ========================================================
     * FULL TOKEN CA
     * ========================================================
     *
     * Never shorten this.
     *
     * The server uses it for:
     *
     * 📋 COPY CA
     *
     * ========================================================
     */

    ca:
      tokenAddress,
  });
}