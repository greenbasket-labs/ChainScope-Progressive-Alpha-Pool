import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createRoot } from 'react-dom/client';

import config from './config/default-config.json';

import {
  discover,
  fetchTokensConcurrent,
} from './api';

import {
  entryScore,
  process,
} from './engine';

import {
  sendTimeframeAlert as sendTelegramTimeframeAlert,
} from './alert-engine';

import type {
  AppConfig,
  TokenRecord,
} from './types';

import './styles.css';

const cfg = config as AppConfig;

/*
 * =========================================================
 * TIMEFRAME GRADE
 * =========================================================
 *
 * 5/5 = A
 * 4/5 = B
 * 3/5 = C
 * 2/5 = D
 *
 * 0/5 and 1/5 = no grade
 *
 * =========================================================
 */

function timeframeGrade(
  passed: number,
  total: number
): string | null {
  if (total !== 5) {
    return null;
  }

  if (passed === 5) {
    return 'A';
  }

  if (passed === 4) {
    return 'B';
  }

  if (passed === 3) {
    return 'C';
  }

  if (passed === 2) {
    return 'D';
  }

  return null;
}

/*
 * =========================================================
 * TIMEFRAME PATH
 * =========================================================
 *
 * Research grading begins at:
 *
 * 10–15m
 * 20–30m
 * 30–40m
 * 40–50m
 * 50–60m
 *
 * Example:
 *
 * A → B → A → D → A
 *
 * =========================================================
 */

function timeframePath(
  results: TokenRecord['timeframeResults'],
  timeframes: AppConfig['timeframes']
): string {
  /*
   * Permanent research timeline.
   *
   * Known historical positions are preserved.
   * NOT_OBSERVED becomes —.
   * Future, not-yet-researched timeframes are
   * not invented or displayed.
   */

  const researchTimeframes =
    timeframes.slice(2);

  let lastRecordedIndex = -1;

  for (
    let index = 0;
    index < researchTimeframes.length;
    index++
  ) {
    if (
      results[
        researchTimeframes[index].id
      ]
    ) {
      lastRecordedIndex = index;
    }
  }

  if (lastRecordedIndex < 0) {
    return '—';
  }

  const path: string[] = [];

  for (
    let index = 0;
    index <= lastRecordedIndex;
    index++
  ) {
    const timeframe =
      researchTimeframes[index];

    const result =
      results[
        timeframe.id
      ];

    if (
      !result ||
      result.status ===
        'NOT_OBSERVED'
    ) {
      path.push('—');
      continue;
    }

    const grade =
      result.grade ??
      (
        result.passed !== null &&
        result.total !== null
          ? timeframeGrade(
              result.passed,
              result.total
            )
          : null
      );

    path.push(
      grade ??
        '—'
    );
  }

  return path.join(
    ' → '
  );
}


/*
 * =========================================================
 * TELEGRAM ALERTS
 * =========================================================
 *
 * A timeframe can trigger a Telegram alert when its
 * current score reaches that timeframe's required score.
 *
 * Each token/timeframe is alerted only once.
 *
 * Entry grade is NOT the alert trigger.
 * Entry grade remains evidence recorded at admission.
 *
 * Telegram alerts also include a COPY CA button.
 * =========================================================
 */

const pct = (
  n: number | null
) =>
  n === null
    ? '—'
    : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/*
 * =========================================================
 * TELEGRAM ALERT DEDUPLICATION
 * =========================================================
 *
 * One alert per token + timeframe.
 * A Telegram failure removes the key so a later poll
 * can retry.
 * =========================================================
 */

const telegramAlerted =
  new Set<string>();

function telegramAlertKey(
  tokenAddress: string,
  timeframeId: string
) {
  return `${tokenAddress}:${timeframeId}`;
}

async function sendTelegramAlert(
  token: TokenRecord,
  timeframeId: string,
  passed: number,
  total: number
) {
  const key =
    telegramAlertKey(
      token.tokenAddress,
      timeframeId
    );

  if (
    telegramAlerted.has(key)
  ) {
    return;
  }

  telegramAlerted.add(key);

  const grade =
    timeframeGrade(
      passed,
      total
    );

  const path =
    timeframePath(
      token.timeframeResults,
      cfg.timeframes
    );

  try {
    await sendTelegramTimeframeAlert(
      token.tokenAddress,
      timeframeId,
      passed,
      total,
      grade,
      path,
      token.entryScore?.passed,
      token.entryScore?.total
    );

    console.log(
      'Telegram finalized timeframe alert sent:',
      token.tokenAddress,
      timeframeId,
      `${passed}/${total}`,
      grade ??
        '—',
      path
    );
  } catch (error) {
    /*
     * Telegram failure must never stop
     * research, discovery, or pool updates.
     *
     * Remove the key so a later poll can retry.
     */

    telegramAlerted.delete(
      key
    );

    console.error(
      'Telegram alert failed:',
      error
    );
  }
}

function App() {
  /*
   * =========================================================
   * POOL STATE
   * =========================================================
   *
   * IMPORTANT:
   *
   * Discovery and Pool are separate.
   *
   * tokens = Research Pool
   *
   * Discovery merely supplies new candidates.
   */

  const [tokens, setTokens] =
    useState<Record<string, TokenRecord>>({});

  const [running, setRunning] =
    useState(false);

  const [selected, setSelected] =
    useState<string | null>(null);

  const [msg, setMsg] =
    useState('Ready');

  const timer =
    useRef<number | undefined>(
      undefined
    );

  /*
   * Prevent overlapping polling cycles.
   */

  const busy =
    useRef(false);

  /*
   * =========================================================
   * POOL LIMIT
   * =========================================================
   *
   * This is deliberately separate from:
   *
   * max_candidates_per_poll
   *
   * Discovery can inspect many candidates.
   *
   * Pool has its own maximum.
   *
   * If maximum_pool_size is not yet present in the
   * configuration, use 100 as a safe temporary default.
   */

  const maximumPoolSize =
    Number(
      (cfg.pool as any)
        .maximum_pool_size ??
      100
    );

  /*
   * =========================================================
   * POLLING CYCLE
   * =========================================================
   */

  const tick = async () => {
    /*
     * Never allow two cycles to process
     * the same pool simultaneously.
     */

    if (busy.current) {
      return;
    }

    busy.current = true;

    try {
      /*
       * =====================================================
       * PART 1 — DISCOVERY
       * =====================================================
       *
       * Discovery is ONLY for finding possible
       * new tokens.
       *
       * It does NOT control the Research Pool.
       */

      setMsg(
        'Discovering tokens...'
      );

      const candidates =
        await discover();

      /*
       * Defensive address deduplication.
       */

      const uniqueCandidates =
        Array.from(
          new Map(
            candidates
              .filter(
                candidate =>
                  Boolean(
                    candidate?.tokenAddress
                  )
              )
              .map(
                candidate => [
                  candidate.tokenAddress,
                  candidate,
                ]
              )
          ).values()
        );

      /*
       * Discovery limit.
       *
       * This is NOT the pool limit.
       */

      const discoveryBatch =
        uniqueCandidates.slice(
          0,
          cfg.pool
            .max_candidates_per_poll
        );

      /*
       * =====================================================
       * PART 2 — FETCH NEW DISCOVERY CANDIDATES
       * =====================================================
       *
       * Only candidates that are not already
       * in the Research Pool need to be fetched
       * through the discovery path.
       *
       * Existing pool tokens are handled separately below.
       */

      const newCandidates =
        discoveryBatch.filter(
          candidate =>
            !tokens[
              candidate.tokenAddress
            ]
        );

      /*
       * Number of free pool slots.
       */

      const activePoolCount =
        Object.values(tokens).filter(
          token =>
            token.status ===
            'ACTIVE'
        ).length;

      const freeSlots =
        Math.max(
          0,
          maximumPoolSize -
            activePoolCount
        );

      /*
       * We never remove an existing token
       * to make room for a new one.
       *
       * If the pool is full, new discoveries
       * are simply not admitted this cycle.
       */

      const admissionCandidates =
        freeSlots > 0
          ? newCandidates.slice(
              0,
              freeSlots
            )
          : [];

      /*
       * Fetch candidates concurrently.
       *
       * This does NOT affect existing pool members.
       */

      let fetchedNew = 0;
      let failedNew = 0;
      let admitted = 0;
      let skippedPoolFull = 0;

      if (
        newCandidates.length >
        admissionCandidates.length
      ) {
        skippedPoolFull =
          newCandidates.length -
          admissionCandidates.length;
      }

      if (
        admissionCandidates.length >
        0
      ) {
        setMsg(
          `Fetching ${admissionCandidates.length} new candidates...`
        );

        const fetched =
          await fetchTokensConcurrent(
            admissionCandidates.map(
              candidate =>
                candidate.tokenAddress
            ),
            8
          );

        fetchedNew =
          fetched.length;

        /*
         * Build quick lookup.
         */

        const snapshotMap =
          new Map(
            fetched.map(
              result => [
                result.tokenAddress,
                result.snapshot,
              ]
            )
          );

        /*
         * ===================================================
         * ADD TO RESEARCH POOL
         * ===================================================
         *
         * IMPORTANT:
         *
         * Entry score does NOT decide whether
         * the token is admitted.
         *
         * A successfully fetched token enters
         * the Research Pool.
         *
         * Entry score is simply recorded as
         * evidence/grade.
         */

        for (
          const candidate of
            admissionCandidates
        ) {
          const address =
            candidate.tokenAddress;

          /*
           * Defensive duplicate protection.
           */

          if (
            tokens[address]
          ) {
            continue;
          }

          const snapshot =
            snapshotMap.get(
              address
            );

          /*
           * A failed fetch means we have
           * no evidence to put into the pool.
           *
           * This is NOT a score rejection.
           */

          if (!snapshot) {
            failedNew++;
            continue;
          }

          /*
           * Grade the token.
           *
           * This is evidence only.
           */

          const entry =
            entryScore(
              snapshot,
              cfg.entry_rules,
              cfg.pool
                .entry_required_score
            );

          /*
           * ===================================================
           * DISCOVERY ENTRY GATE
           * ===================================================
           *
           * Only tokens with Entry Grade >= 3/6
           * are admitted into the Research Pool.
           *
           * 2/6 -> BLOCK
           * 3/6 -> ALLOW
           * 4/6 -> ALLOW
           * 5/6 -> ALLOW
           *
           * This is an admission filter only.
           * It does not alter the calculated score.
           * ===================================================
           */

          if (
            entry.passed < 3
          ) {
            continue;
          }

          /*
           * Create Research Pool record.
           */

          const record: TokenRecord = {
            tokenAddress:
              address,

            pairAddress:
              snapshot.pairAddress,

            dexId:
              snapshot.dexId,

            firstSeenAt:
              snapshot.fetchedAt,

            discoverySources:
              candidate.sources ??
              (
                candidate.source
                  ? [candidate.source]
                  : []
              ),

            entryScore:
              entry,

            observations: [],

            timeframeResults: {},

            status:
              'ACTIVE',

            currentTimeframeId:
              'outside',
          };

          /*
           * First observation is immediately
           * processed.
           */

          const processed =
            process(
              record,
              snapshot,
              cfg
            );

          /*
           * Telegram:
           *
           * Admission does NOT trigger a
           * timeframe alert.
           *
           * A timeframe must first become
           * FINALIZED.
           */

          /*
           * Add to pool.
           */

          tokens[address] =
            processed;

          admitted++;
        }
      }

      /*
       * =====================================================
       * PART 3 — EXISTING RESEARCH POOL
       * =====================================================
       *
       * THIS IS THE MOST IMPORTANT PART.
       *
       * Existing pool tokens are NOT dependent
       * on today's discovery results.
       *
       * They remain research subjects.
       *
       * We fetch them directly and continue
       * their observation history.
       */

      const poolMembers =
        Object.values(
          tokens
        ).filter(
          token =>
            token.status ===
            'ACTIVE'
        );

      /*
       * Fetch every active pool member.
       *
       * Discovery is irrelevant here.
       */

      let poolUpdated = 0;
      let poolFetchFailed = 0;

      if (
        poolMembers.length >
        0
      ) {
        setMsg(
          `Updating ${poolMembers.length} pool tokens...`
        );

        const poolFetch =
          await fetchTokensConcurrent(
            poolMembers.map(
              token =>
                token.tokenAddress
            ),
            8
          );

        const poolSnapshots =
          new Map(
            poolFetch.map(
              result => [
                result.tokenAddress,
                result.snapshot,
              ]
            )
          );

        /*
         * Update every existing pool token.
         */

        for (
          const token of
            poolMembers
        ) {
          const snapshot =
            poolSnapshots.get(
              token.tokenAddress
            );

          /*
           * A temporary provider failure
           * must NOT delete the token.
           *
           * It simply means this polling
           * cycle has no new observation.
           */

          if (!snapshot) {
            poolFetchFailed++;
            continue;
          }

          /*
           * Continue research.
           *
           * process() calculates:
           *
           * - age
           * - growth
           * - pullback
           * - timeframe
           * - timeframe score
           * - expiration
           */

          const updated =
            process(
              token,
              snapshot,
              cfg
            );

          /*
           * Telegram:
           *
           * Alert ONLY when a timeframe has just
           * become FINALIZED.
           *
           * We do NOT alert merely because the
           * current/in-progress timeframe qualifies.
           */

          for (
            const timeframe of
              cfg.timeframes.slice(2)
          ) {
            const before =
              token.timeframeResults[
                timeframe.id
              ];

            const after =
              updated.timeframeResults[
                timeframe.id
              ];

            if (
              after?.status ===
                'FINALIZED' &&
              before?.status !==
                'FINALIZED' &&
              after.passed !== null &&
              after.total !== null
            ) {
              void sendTelegramAlert(
                updated,
                timeframe.id,
                after.passed,
                after.total
              );
            }
          }

          /*
           * Preserve discovery history.
           */

          updated.discoverySources =
            token.discoverySources ??
            [];

          /*
           * Preserve original entry grade.
           *
           * Entry score describes the token
           * when it entered the pool.
           */

          updated.entryScore =
            token.entryScore;

          /*
           * Save updated pool record.
           */

          tokens[
            token.tokenAddress
          ] = updated;

          poolUpdated++;
        }
      }

      /*
       * =====================================================
       * PART 4 — SAVE RESEARCH POOL
       * =====================================================
       *
       * Discovery is not persisted as the pool.
       *
       * The Research Pool is persisted.
       */

      setTokens({
        ...tokens,
      });

      localStorage.setItem(
        'chainscope-alpha-pool',
        JSON.stringify(tokens)
      );

      /*
       * =====================================================
       * PART 5 — REPORT
       * =====================================================
       */

      const activeAfter =
        Object.values(
          tokens
        ).filter(
          token =>
            token.status ===
            'ACTIVE'
        ).length;

      const expired =
        Object.values(
          tokens
        ).filter(
          token =>
            token.status ===
            'EXPIRED'
        ).length;

      setMsg(
        [
          `Discovered ${uniqueCandidates.length}`,
          `new ${newCandidates.length}`,
          `fetched ${fetchedNew}`,
          `admitted ${admitted}`,
          `pool updated ${poolUpdated}`,
          `fetch failed ${poolFetchFailed + failedNew}`,
          `pool ${activeAfter}/${maximumPoolSize}`,
          `expired ${expired}`,
          skippedPoolFull > 0
            ? `waiting ${skippedPoolFull}`
            : '',
          new Date()
            .toLocaleTimeString(),
        ]
          .filter(Boolean)
          .join(' · ')
      );
    } catch (
      error
    ) {
      setMsg(
        error instanceof Error
          ? error.message
          : 'Update failed'
      );
    } finally {
      busy.current =
        false;
    }
  };

  /*
   * =========================================================
   * START / STOP
   * =========================================================
   */

  useEffect(() => {
    if (running) {
      void tick();

      timer.current =
        window.setInterval(
          () => {
            void tick();
          },
          cfg.pool
            .polling_interval_seconds *
            1000
        );
    }

    return () => {
      if (
        timer.current !==
        undefined
      ) {
        window.clearInterval(
          timer.current
        );

        timer.current =
          undefined;
      }
    };
  }, [running]);

  /*
   * =========================================================
   * RESTORE RESEARCH POOL
   * =========================================================
   */

  useEffect(() => {
    const saved =
      localStorage.getItem(
        'chainscope-alpha-pool'
      );

    if (!saved) {
      return;
    }

    try {
      setTokens(
        JSON.parse(saved)
      );
    } catch {
      console.warn(
        'Could not restore saved Research Pool.'
      );
    }
  }, []);

  /*
   * =========================================================
   * ACTIVE POOL
   * =========================================================
   */

  const active =
    useMemo(
      () =>
        Object.values(
          tokens
        ).filter(
          token =>
            token.status ===
            'ACTIVE'
        ),
      [tokens]
    );

  /*
   * =========================================================
   * TIMEFRAME VIEWS
   * =========================================================
   *
   * These are VIEWS over the pool.
   *
   * They are NOT separate pools.
   *
   * A token moving from 5–10m to 10–15m
   * remains the same pool token.
   */

  const buckets =
    cfg.timeframes.map(
      timeframe => ({
        tf: timeframe,

        ts: active.filter(
          token =>
            token.currentTimeframeId ===
            timeframe.id
        ),
      })
    );

  /*
   * =========================================================
   * SELECTED TIMEFRAME
   * =========================================================
   */

  const selectedTimeframe =
    selected
      ? buckets.find(
          bucket =>
            bucket.tf.id ===
            selected
        )
      : null;

  /*
   * =========================================================
   * TOKEN DETAIL
   * =========================================================
   *
   * selected can represent either:
   *
   * - timeframe id
   * - token address
   */

  const detail =
    selected &&
    tokens[selected]
      ? tokens[selected]
      : null;

  /*
   * =========================================================
   * DISPLAY TOKENS
   * =========================================================
   */

  const selectedTokens =
    selectedTimeframe
      ? selectedTimeframe.ts
      : detail
        ? []
        : active;

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <main>
      <header>
        <div>
          <small>
            CHAINSCOPE
          </small>

          <h1>
            Progressive Alpha Pool
          </h1>

          <p>
            Discover → Entry Filter →
            Observe → Score → Continue →
            Expire
          </p>
        </div>

        <b
          className={
            running
              ? 'live'
              : ''
          }
        >
          {running
            ? '● LIVE'
            : '○ STOPPED'}
        </b>
      </header>

      <section className="bar">
        <button
          onClick={() =>
            setRunning(
              value => !value
            )
          }
        >
          {running
            ? 'Stop Pool'
            : 'Start Pool'}
        </button>

        <span>
          Polling{' '}
          <strong>
            {
              cfg.pool
                .polling_interval_seconds
            }
            s
          </strong>
        </span>

        <span>
          Max age{' '}
          <strong>
            {
              cfg.pool
                .maximum_research_minutes
            }
            m
          </strong>
        </span>

        <span>
          Pool{' '}
          <strong>
            {active.length}/
            {maximumPoolSize}
          </strong>
        </span>

        <span>
          Entry grade{' '}
          <strong>
            {
              cfg.pool
                .entry_required_score
            }
            /
            {
              cfg.entry_rules.filter(
                rule =>
                  rule.enabled
              ).length
            }
          </strong>
        </span>

        <em>
          {msg}
        </em>
      </section>

      <section className="buckets">
        {buckets.map(
          bucket => (
            <button
              key={
                bucket.tf.id
              }
              onClick={() =>
                setSelected(
                  selected ===
                    bucket.tf.id
                    ? null
                    : bucket.tf.id
                )
              }
            >
              <strong>
                {
                  bucket.tf.label
                }
              </strong>

              <big>
                {
                  bucket.ts.length
                }
              </big>

              <small>
                Required{' '}
                {
                  bucket.tf
                    .required_score
                }
                /
                {
                  bucket.tf.rules.filter(
                    rule =>
                      rule.enabled
                  ).length
                }
              </small>
            </button>
          )
        )}
      </section>

      <section className="panel">
        <div className="title">
          <h2>
            {selectedTimeframe
              ? selectedTimeframe
                  .tf.label
              : 'Research Pool'}
          </h2>

          <span>
            {selectedTimeframe
              ? `${selectedTokens.length} tokens`
              : `${active.length} active tokens`}
          </span>
        </div>

        {selectedTokens.length ===
        0 ? (
          <div className="empty">
            <strong>
              No tokens in this view
            </strong>

            <span>
              The Research Pool is
              populated from live
              discovery and retained
              independently.
            </span>
          </div>
        ) : (
          selectedTokens.map(
            token => {
              const observation =
                token.observations.at(
                  -1
                );

              if (!observation) {
                return null;
              }

              const result =
                token.timeframeResults[
                  token.currentTimeframeId
                ];

              return (
                <button
                  className="row"
                  key={
                    token.tokenAddress
                  }
                  onClick={() =>
                    setSelected(
                      token.tokenAddress
                    )
                  }
                >
                  <code>
                    {
                      token.tokenAddress.slice(
                        0,
                        7
                      )
                    }
                    …
                    {
                      token.tokenAddress.slice(
                        -5
                      )
                    }
                  </code>

                  <span>
                    {
                      observation.ageMinutes.toFixed(
                        1
                      )
                    }
                    m
                  </span>

                  <span>
                    Entry{' '}
                    <strong>
                      {token.entryScore
                        ? `${token.entryScore.passed}/${token.entryScore.total}`
                        : '—'}
                    </strong>
                  </span>

                  <span>
                    MC{' '}
                    {pct(
                      observation.mcGrowth
                    )}
                  </span>

                  <span>
                    Liq{' '}
                    {pct(
                      observation.liquidityGrowth
                    )}
                  </span>

                  <span>
                    Vol{' '}
                    {pct(
                      observation.volumeGrowth
                    )}
                  </span>

                  <strong>
                    {result &&
                    result.passed !== null &&
                    result.total !== null
                      ? `${result.passed}/${result.total}${
                          timeframeGrade(
                            result.passed,
                            result.total
                          )
                            ? ` → ${timeframeGrade(
                                result.passed,
                                result.total
                              )}`
                            : ''
                        }`
                      : '—'}
                  </strong>

                  <span>
                    PATH{' '}
                    <strong>
                      {timeframePath(
                        token.timeframeResults,
                        cfg.timeframes
                      ) || '—'}
                    </strong>
                  </span>
                </button>
              );
            }
          )
        )}
      </section>

      {detail && (
        <section className="panel">
          <div className="title">
            <h2>
              Token History
            </h2>

            <button
              onClick={() =>
                setSelected(null)
              }
            >
              Close
            </button>
          </div>

          <code>
            {
              detail.tokenAddress
            }
          </code>

          <div className="history">
            <span>
              Entry Grade
            </span>

            <strong>
              {detail.entryScore
                ? `${detail.entryScore.passed}/${detail.entryScore.total}`
                : '—'}
            </strong>

            <span>
              Behavioral Path
            </span>

            <strong>
              {timeframePath(
                detail.timeframeResults,
                cfg.timeframes
              ) || '—'}
            </strong>

            <span>
              Sources
            </span>

            <strong>
              {
                detail.discoverySources?.join(
                  ' + '
                ) ||
                'unknown'
              }
            </strong>
          </div>

          {detail.observations
            .slice(-20)
            .map(
              observation => {
                const result =
                  detail.timeframeResults[
                    observation
                      .timeframeId
                  ];

                return (
                  <div
                    className="history"
                    key={
                      observation.fetchedAt
                    }
                  >
                    <span>
                      {
                        observation.ageMinutes.toFixed(
                          1
                        )
                      }
                      m
                    </span>

                    <span>
                      {
                        observation.timeframeId
                      }
                    </span>

                    <span>
                      MC{' '}
                      {pct(
                        observation.mcGrowth
                      )}
                    </span>

                    <span>
                      Liq{' '}
                      {pct(
                        observation.liquidityGrowth
                      )}
                    </span>

                    <span>
                      Vol{' '}
                      {pct(
                        observation.volumeGrowth
                      )}
                    </span>

                    <span>
                      MC PB{' '}
                      {pct(
                        observation.mcPullback
                      )}
                    </span>

                    <strong>
                      {result &&
                      result.passed !== null &&
                      result.total !== null
                        ? `${result.passed}/${result.total}${
                            timeframeGrade(
                              result.passed,
                              result.total
                            )
                              ? ` → ${timeframeGrade(
                                  result.passed,
                                  result.total
                                )}`
                              : ''
                          }`
                        : '—'}
                    </strong>
                  </div>
                );
              }
            )}
        </section>
      )}

      <footer>
        DexScreener only · local
        persistence · no trading
      </footer>
    </main>
  );
}

createRoot(
  document.getElementById(
    'root'
  )!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);