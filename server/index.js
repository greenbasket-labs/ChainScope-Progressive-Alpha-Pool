import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

/*
 * ============================================================
 * EXPRESS
 * ============================================================
 */

app.use(express.json());

/*
 * ============================================================
 * DEXSCREENER
 * ============================================================
 */

const BASE =
  'https://api.dexscreener.com';

const ENDPOINTS = {
  profiles:
    '/token-profiles/latest/v1',

  boostsLatest:
    '/token-boosts/latest/v1',

  boostsTop:
    '/token-boosts/top/v1',

  tokenPairs: (
    chain,
    address
  ) =>
    `/token-pairs/v1/${chain}/${encodeURIComponent(
      address
    )}`,

  tokens: (
    chain,
    addresses
  ) =>
    `/tokens/v1/${chain}/${addresses.join(',')}`,

  pair: (
    chain,
    pairId
  ) =>
    `/latest/dex/pairs/${chain}/${encodeURIComponent(
      pairId
    )}`,

  search: query =>
    `/latest/dex/search?q=${encodeURIComponent(
      query
    )}`,
};

/*
 * ============================================================
 * DEXSCREENER REQUEST
 * ============================================================
 */

async function getDex(
  pathname
) {
  const response =
    await fetch(
      BASE + pathname,
      {
        headers: {
          accept:
            'application/json',

          'user-agent':
            'ChainScope-Progressive-Alpha-Pool/1.0',
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `DexScreener ${response.status} ${pathname}`
    );
  }

  return response.json();
}

/*
 * ============================================================
 * DISCOVERY NORMALIZATION
 * ============================================================
 */

function normalizeCandidate(
  item,
  source
) {
  if (!item?.tokenAddress) {
    return null;
  }

  if (
    item.chainId &&
    item.chainId !== 'solana'
  ) {
    return null;
  }

  return {
    tokenAddress:
      item.tokenAddress,

    chainId:
      item.chainId ||
      'solana',

    source,

    url:
      item.url ||
      null,

    icon:
      item.icon ||
      null,

    header:
      item.header ||
      null,

    description:
      item.description ||
      null,

    links:
      item.links ||
      [],
  };
}

/*
 * ============================================================
 * MERGE DISCOVERY SOURCES
 * ============================================================
 *
 * Same token address = one candidate.
 *
 * Sources are preserved.
 * ============================================================
 */

function mergeCandidates(
  groups
) {
  const map =
    new Map();

  for (
    const group of groups
  ) {
    for (
      const item of
        group.items || []
    ) {
      const candidate =
        normalizeCandidate(
          item,
          group.source
        );

      if (!candidate) {
        continue;
      }

      const existing =
        map.get(
          candidate.tokenAddress
        );

      if (!existing) {
        map.set(
          candidate.tokenAddress,
          {
            ...candidate,
            sources: [
              candidate.source,
            ],
          }
        );

        continue;
      }

      if (
        !existing.sources.includes(
          candidate.source
        )
      ) {
        existing.sources.push(
          candidate.source
        );
      }

      if (
        !existing.url &&
        candidate.url
      ) {
        existing.url =
          candidate.url;
      }

      if (
        !existing.icon &&
        candidate.icon
      ) {
        existing.icon =
          candidate.icon;
      }

      if (
        !existing.header &&
        candidate.header
      ) {
        existing.header =
          candidate.header;
      }

      if (
        !existing.description &&
        candidate.description
      ) {
        existing.description =
          candidate.description;
      }

      if (
        (
          !existing.links ||
          existing.links.length ===
            0
        ) &&
        candidate.links?.length
      ) {
        existing.links =
          candidate.links;
      }
    }
  }

  return [
    ...map.values(),
  ];
}

/*
 * ============================================================
 * TELEGRAM
 * ============================================================
 *
 * IMPORTANT:
 *
 * Never put the Telegram bot token in:
 *
 * - React
 * - main.tsx
 * - default-config.json
 * - GitHub
 *
 * The server reads:
 *
 * TELEGRAM_BOT_TOKEN
 * TELEGRAM_CHAT_ID
 *
 * from the environment.
 * ============================================================
 */

const TELEGRAM_BOT_TOKEN =
  process.env
    .TELEGRAM_BOT_TOKEN || '';

const TELEGRAM_CHAT_ID =
  process.env
    .TELEGRAM_CHAT_ID || '';

function telegramConfigured() {
  return (
    Boolean(
      TELEGRAM_BOT_TOKEN
    ) &&
    Boolean(
      TELEGRAM_CHAT_ID
    )
  );
}

/*
 * ============================================================
 * SEND TELEGRAM MESSAGE
 * ============================================================
 */

async function sendTelegramMessage(
  message,
  copyCa = null
) {
  if (
    !telegramConfigured()
  ) {
    throw new Error(
      'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.'
    );
  }

  const url =
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id:
      TELEGRAM_CHAT_ID,

    text:
      message,

    disable_web_page_preview:
      true,
  };

  /*
   * ==========================================================
   * COPY CA BUTTON
   * ==========================================================
   */

  if (
    typeof copyCa === 'string' &&
    copyCa.trim()
  ) {
    body.reply_markup = {
      inline_keyboard: [
        [
          {
            text:
              '📋 COPY CA',

            copy_text: {
              text:
                copyCa.trim(),
            },
          },
        ],
      ],
    };
  }

  const response =
    await fetch(
      url,
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/json',

          accept:
            'application/json',
        },

        body:
          JSON.stringify(body),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      data?.description ||
        `Telegram ${response.status}`
    );
  }

  return data;
}

/*
 * ============================================================
 * TELEGRAM STATUS
 * ============================================================
 */

app.get(
  '/api/telegram/status',
  (_req, res) => {
    res.json({
      configured:
        telegramConfigured(),

      botTokenConfigured:
        Boolean(
          TELEGRAM_BOT_TOKEN
        ),

      chatIdConfigured:
        Boolean(
          TELEGRAM_CHAT_ID
        ),
    });
  }
);

/*
 * ============================================================
 * TELEGRAM TEST
 * ============================================================
 *
 * POST /api/telegram/test
 *
 * Optional body:
 *
 * {
 *   "message": "Hello from ChainScope"
 * }
 *
 * This is ONLY a test endpoint for now.
 *
 * It does not affect:
 *
 * - discovery
 * - pool
 * - scoring
 * - research
 * ============================================================
 */

app.post(
  '/api/telegram/test',
  async (
    req,
    res
  ) => {
    try {
      const message =
        typeof req.body?.message ===
        'string' &&
        req.body.message.trim()
          ? req.body.message.trim()
          : [
              '🧪 ChainScope Telegram Test',
              '',
              'Telegram alerts are connected.',
              '',
              `Time: ${new Date().toLocaleString()}`,
            ].join('\n');

      await sendTelegramMessage(
        message
      );

      res.json({
        ok: true,
        sent: true,
      });
    } catch (
      error
    ) {
      res.status(502).json({
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * TELEGRAM ALERT
 * ============================================================
 *
 * POST /api/telegram/alert
 *
 * Body:
 *
 * {
 *   "message": "ChainScope alert...",
 *   "ca": "FULL_SOLANA_TOKEN_ADDRESS"
 * }
 *
 * This endpoint ONLY sends an alert.
 *
 * It does NOT:
 * - admit tokens
 * - reject tokens
 * - change scores
 * - change timeframes
 * - remove tokens
 * - expire tokens
 *
 * ============================================================
 */

app.post(
  '/api/telegram/alert',
  async (
    req,
    res
  ) => {
    try {
      const message =
        typeof req.body?.message ===
          'string' &&
        req.body.message.trim()
          ? req.body.message.trim()
          : '';

      const ca =
        typeof req.body?.ca ===
          'string' &&
        req.body.ca.trim()
          ? req.body.ca.trim()
          : null;

      if (!message) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              'message is required',
          });
      }

      await sendTelegramMessage(
        message,
        ca
      );

      res.json({
        ok: true,
        sent: true,
        copyCa:
          Boolean(ca),
      });
    } catch (
      error
    ) {
      res.status(502).json({
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * LIVE DISCOVERY
 * ============================================================
 *
 * Sources:
 *
 * 1. token-profiles-latest
 * 2. token-boosts-latest
 * 3. token-boosts-top
 *
 * Duplicate token addresses are merged.
 * ============================================================
 */

app.get(
  '/api/discovery',
  async (
    _req,
    res
  ) => {
    try {
      const results =
        await Promise.allSettled(
          [
            getDex(
              ENDPOINTS.profiles
            ),

            getDex(
              ENDPOINTS.boostsLatest
            ),

            getDex(
              ENDPOINTS.boostsTop
            ),
          ]
        );

      const groups =
        [];

      const names = [
        'token-profiles-latest',
        'token-boosts-latest',
        'token-boosts-top',
      ];

      results.forEach(
        (
          result,
          index
        ) => {
          if (
            result.status !==
            'fulfilled'
          ) {
            return;
          }

          const data =
            result.value;

          groups.push({
            source:
              names[index],

            items:
              Array.isArray(
                data
              )
                ? data
                : [],
          });
        }
      );

      const candidates =
        mergeCandidates(
          groups
        );

      res.json({
        fetchedAt:
          Date.now(),

        sources:
          names,

        count:
          candidates.length,

        candidates,
      });
    } catch (
      error
    ) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * BATCH TOKEN → PAIRS
 * ============================================================
 *
 * Maximum 30 addresses per request.
 * ============================================================
 */

app.get(
  '/api/tokens',
  async (
    req,
    res
  ) => {
    try {
      const raw =
        String(
          req.query.addresses ||
            ''
        );

      const addresses =
        [
          ...new Set(
            raw
              .split(',')
              .map(
                x =>
                  x.trim()
              )
              .filter(
                Boolean
              )
          ),
        ].slice(
          0,
          30
        );

      if (
        !addresses.length
      ) {
        return res
          .status(400)
          .json({
            error:
              'addresses query parameter is required',
          });
      }

      const data =
        await getDex(
          ENDPOINTS.tokens(
            'solana',
            addresses
          )
        );

      res.json(
        data
      );
    } catch (
      error
    ) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * TOKEN → ALL POOLS
 * ============================================================
 */

app.get(
  '/api/token-pairs/:address',
  async (
    req,
    res
  ) => {
    try {
      const data =
        await getDex(
          ENDPOINTS.tokenPairs(
            'solana',
            req.params.address
          )
        );

      res.json(
        data
      );
    } catch (
      error
    ) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * TOKEN MARKET DATA
 * ============================================================
 *
 * Primary:
 *
 * /tokens/v1/solana/{address}
 *
 * Fallback:
 *
 * /token-pairs/v1/solana/{address}
 *
 * Enrichment:
 *
 * /latest/dex/pairs/solana/{pair}
 * ============================================================
 */

app.get(
  '/api/token/:address',
  async (
    req,
    res
  ) => {
    try {
      const address =
        req.params.address;

      let tokenData =
        await getDex(
          ENDPOINTS.tokens(
            'solana',
            [address]
          )
        );

      let pairs =
        Array.isArray(
          tokenData
        )
          ? tokenData
          : tokenData?.pairs ||
            [];

      pairs =
        pairs.filter(
          pair =>
            pair?.chainId ===
            'solana'
        );

      /*
       * Fallback.
       */

      if (
        !pairs.length
      ) {
        const fallback =
          await getDex(
            ENDPOINTS.tokenPairs(
              'solana',
              address
            )
          );

        pairs =
          Array.isArray(
            fallback
          )
            ? fallback
            : fallback?.pairs ||
              [];
      }

      pairs =
        pairs.filter(
          pair =>
            pair?.chainId ===
            'solana'
        );

      /*
       * Highest-liquidity pair.
       */

      const selected =
        pairs
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              (
                b?.liquidity?.usd ??
                0
              ) -
              (
                a?.liquidity?.usd ??
                0
              )
          )[0];

      if (!selected) {
        return res.json({
          pairs: [],

          selectedPair:
            null,
        });
      }

      /*
       * Pair enrichment.
       */

      let enriched =
        selected;

      if (
        selected.pairAddress
      ) {
        try {
          const pairData =
            await getDex(
              ENDPOINTS.pair(
                'solana',
                selected.pairAddress
              )
            );

          if (
            pairData?.pair
          ) {
            enriched =
              pairData.pair;
          } else if (
            Array.isArray(
              pairData?.pairs
            ) &&
            pairData.pairs.length
          ) {
            enriched =
              pairData.pairs[0];
          }
        } catch {
          /*
           * Keep token endpoint
           * result if enrichment fails.
           */
        }
      }

      res.json({
        pairs,

        selectedPair:
          enriched,

        fetchedAt:
          Date.now(),
      });
    } catch (
      error
    ) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * EXPLICIT PAIR LOOKUP
 * ============================================================
 */

app.get(
  '/api/pair/:pairId',
  async (
    req,
    res
  ) => {
    try {
      const data =
        await getDex(
          ENDPOINTS.pair(
            'solana',
            req.params.pairId
          )
        );

      res.json(
        data
      );
    } catch (
      error
    ) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * DEXSCREENER SEARCH
 * ============================================================
 */

app.get(
  '/api/search',
  async (
    req,
    res
  ) => {
    try {
      const query =
        String(
          req.query.q ||
            ''
        ).trim();

      if (!query) {
        return res
          .status(400)
          .json({
            error:
              'q query parameter is required',
          });
      }

      const data =
        await getDex(
          ENDPOINTS.search(
            query
          )
        );

      res.json(
        data
      );
    } catch (
      error
    ) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

/*
 * ============================================================
 * HEALTH
 * ============================================================
 */

app.get(
  '/api/health',
  (_req, res) => {
    res.json({
      ok: true,

      provider:
        'DexScreener',

      chain:
        'solana',

      telegram:
        telegramConfigured(),

      time:
        Date.now(),
    });
  }
);

/*
 * ============================================================
 * FRONTEND
 * ============================================================
 */

app.use(
  express.static(
    path.join(
      dir,
      '..',
      'dist'
    )
  )
);

app.get(
  /^(?!\/api).*/,
  (_req, res) =>
    res.sendFile(
      path.join(
        dir,
        '..',
        'dist',
        'index.html'
      )
    )
);

/*
 * ============================================================
 * START
 * ============================================================
 */

app.listen(
  port,
  () => {
    console.log(
      `ChainScope Progressive Alpha Pool listening on http://localhost:${port}`
    );

    console.log(
      `Telegram: ${
        telegramConfigured()
          ? 'configured'
          : 'not configured'
      }`
    );
  }
);