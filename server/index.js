import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const BASE = 'https://api.dexscreener.com';

const ENDPOINTS = {
  profiles: '/token-profiles/latest/v1',
  boostsLatest: '/token-boosts/latest/v1',
  boostsTop: '/token-boosts/top/v1',
  tokenPairs: (chain, address) =>
    `/token-pairs/v1/${chain}/${encodeURIComponent(address)}`,
  tokens: (chain, addresses) =>
    `/tokens/v1/${chain}/${addresses.join(',')}`,
  pair: (chain, pairId) =>
    `/latest/dex/pairs/${chain}/${encodeURIComponent(pairId)}`,
  search: query =>
    `/latest/dex/search?q=${encodeURIComponent(query)}`,
};

async function getDex(pathname) {
  const response = await fetch(BASE + pathname, {
    headers: {
      accept: 'application/json',
      'user-agent': 'ChainScope-Progressive-Alpha-Pool/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`DexScreener ${response.status} ${pathname}`);
  }

  return response.json();
}

function normalizeCandidate(item, source) {
  if (!item?.tokenAddress) return null;
  if (item.chainId && item.chainId !== 'solana') return null;

  return {
    tokenAddress: item.tokenAddress,
    chainId: item.chainId || 'solana',
    source,
    url: item.url || null,
    icon: item.icon || null,
    header: item.header || null,
    description: item.description || null,
    links: item.links || [],
  };
}

function mergeCandidates(groups) {
  const map = new Map();

  for (const group of groups) {
    for (const item of group.items || []) {
      const candidate = normalizeCandidate(item, group.source);

      if (!candidate) continue;

      const existing = map.get(candidate.tokenAddress);

      if (!existing) {
        map.set(candidate.tokenAddress, {
          ...candidate,
          sources: [candidate.source],
        });
        continue;
      }

      if (!existing.sources.includes(candidate.source)) {
        existing.sources.push(candidate.source);
      }

      if (!existing.url && candidate.url) {
        existing.url = candidate.url;
      }

      if (!existing.icon && candidate.icon) {
        existing.icon = candidate.icon;
      }

      if (!existing.header && candidate.header) {
        existing.header = candidate.header;
      }

      if (!existing.description && candidate.description) {
        existing.description = candidate.description;
      }

      if (
        (!existing.links || existing.links.length === 0) &&
        candidate.links?.length
      ) {
        existing.links = candidate.links;
      }
    }
  }

  return [...map.values()];
}

/* ============================================================
 * OBSERVER STATE
 * ============================================================ */

const observerRecords = new Map();

let observerLastUpdate = null;

const observerConfig = {
  timeframes: [],
  marks: [],
};

/* ============================================================
 * POOL API CONTROL STATE
 * ============================================================ */

const poolControl = {
  running: false,
  requestedAction: 'idle',
  commandId: 0,
  lastCommandAt: null,
  lastTickRequestedAt: null,
  lastTickCompletedAt: null,
};

/* ============================================================
 * POOL STATUS
 * ============================================================ */

app.get(
  '/api/pool/status',
  (_req, res) => {
    res.json({
      ok: true,
      running: poolControl.running,
      requestedAction: poolControl.requestedAction,
      commandId: poolControl.commandId,
      lastCommandAt: poolControl.lastCommandAt,
      lastTickRequestedAt: poolControl.lastTickRequestedAt,
      lastTickCompletedAt: poolControl.lastTickCompletedAt,
      observerRecords: observerRecords.size,
      observerLastUpdate,
    });
  },
);

/* ============================================================
 * POOL START
 * ============================================================ */

app.post(
  '/api/pool/start',
  (_req, res) => {
    poolControl.running = true;
    poolControl.requestedAction = 'start';
    poolControl.commandId += 1;
    poolControl.lastCommandAt = Date.now();

    return res.json({
      ok: true,
      running: true,
      command: 'start',
      commandId: poolControl.commandId,
      requestedAt: poolControl.lastCommandAt,
    });
  },
);

/* ============================================================
 * POOL STOP
 * ============================================================ */

app.post(
  '/api/pool/stop',
  (_req, res) => {
    poolControl.running = false;
    poolControl.requestedAction = 'stop';
    poolControl.commandId += 1;
    poolControl.lastCommandAt = Date.now();

    return res.json({
      ok: true,
      running: false,
      command: 'stop',
      commandId: poolControl.commandId,
      requestedAt: poolControl.lastCommandAt,
    });
  },
);

/* ============================================================
 * POOL TICK
 * ============================================================ */

app.post(
  '/api/pool/tick',
  (_req, res) => {
    poolControl.requestedAction = 'tick';
    poolControl.commandId += 1;
    poolControl.lastTickRequestedAt = Date.now();
    poolControl.lastCommandAt = poolControl.lastTickRequestedAt;

    return res.json({
      ok: true,
      command: 'tick',
      commandId: poolControl.commandId,
      requestedAt: poolControl.lastTickRequestedAt,
    });
  },
);

  /* ============================================================
 * POOL TICK COMPLETE
 * ============================================================ */

app.post(
  '/api/pool/tick-complete',
  (req, res) => {
    poolControl.lastTickCompletedAt =
      Date.now();

    return res.json({
      ok: true,
      completed: true,
      commandId:
        Number(req.body?.commandId || 0),
      completedAt:
        poolControl.lastTickCompletedAt,
    });
  },
);

/* ============================================================
 * OBSERVER HEALTH
 * ============================================================ */

app.get(
  '/api/observer/health',
  (_req, res) => {
    res.json({
      ok: true,

      tool:
        'ChainScope Progressive Alpha Observer',

      observerRecords:
        observerRecords.size,

      lastUpdate:
        observerLastUpdate,

      timeframes:
        observerConfig.timeframes,

      marks:
        observerConfig.marks,

      telegramConfigured:
        telegramConfigured(),

      dexBase:
        BASE,
    });
  },
);

/* ============================================================
 * OBSERVER RULES
 * ============================================================ */

app.get(
  '/api/observer/rules',
  (_req, res) => {
    res.json({
      timeframes:
        observerConfig.timeframes,

      marks:
        observerConfig.marks,

      evidenceOnly:
        true,

      gradeSource:
        'research-engine',

      pathSource:
        'research-engine',
    });
  },
);

/* ============================================================
 * OBSERVER TOKENS
 * ============================================================ */

app.get(
  '/api/observer/tokens',
  (_req, res) => {
    res.json(
      [...observerRecords.values()],
    );
  },
);

/* ============================================================
 * OBSERVER SINGLE TOKEN
 * ============================================================ */

app.get(
  '/api/observer/token/:address',
  (req, res) => {
    const address =
      req.params.address;

    const record =
      observerRecords.get(address);

    if (!record) {
      return res.status(404).json({
        error:
          'observer token not found',
      });
    }

    return res.json(record);
  },
);

/* ============================================================
 * OBSERVER RECORD
 * ============================================================
 *
 * The frontend research engine sends the already-calculated
 * permanent research record here.
 *
 * The server does NOT calculate:
 *
 * - score
 * - grade
 * - PATH
 * - evidence
 * - ATH
 *
 * It only stores and exposes the result.
 *
 * ============================================================ */

app.post(
  '/api/observer/record',
  (req, res) => {
    try {
      const record =
        req.body;

      const address =
        typeof record?.tokenAddress ===
        'string'
          ? record.tokenAddress.trim()
          : '';

      if (!address) {
        return res.status(400).json({
          ok: false,
          error:
            'tokenAddress is required',
        });
      }

      observerRecords.set(
        address,
        {
          ...record,

          tokenAddress:
            address,

          updatedAt:
            Date.now(),
        },
      );

      observerLastUpdate =
        Date.now();

      return res.json({
        ok: true,

        stored: true,

        tokenAddress:
          address,

        updatedAt:
          observerLastUpdate,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * OBSERVER TIMEFRAME
 * ============================================================ */

app.get(
  '/api/observer/token/:address/timeframe/:timeframeId',
  (req, res) => {
    const record =
      observerRecords.get(
        req.params.address,
      );

    if (!record) {
      return res.status(404).json({
        error:
          'observer token not found',
      });
    }

    const timeframeId =
      req.params.timeframeId;

    const result =
      record.timeframeResults?.[
        timeframeId
      ];

    if (!result) {
      return res.status(404).json({
        error:
          'timeframe result not found',
      });
    }

    return res.json({
      tokenAddress:
        record.tokenAddress,

      timeframeId,

      result,
    });
  },
);

/* ============================================================
 * OBSERVER EVIDENCE
 * ============================================================ */

app.get(
  '/api/observer/token/:address/evidence',
  (req, res) => {
    const record =
      observerRecords.get(
        req.params.address,
      );

    if (!record) {
      return res.status(404).json({
        error:
          'observer token not found',
      });
    }

    const timeframeId =
      typeof req.query.timeframe ===
      'string'
        ? req.query.timeframe
        : null;

    if (timeframeId) {
      return res.json({
        tokenAddress:
          record.tokenAddress,

        timeframeId,

        evidence:
          record
            .timeframeResults?.[
              timeframeId
            ]
            ?.observerEvidence ??
          [],
      });
    }

    const evidence = [];

    for (
      const result of Object.values(
        record.timeframeResults || {},
      )
    ) {
      if (
        result?.observerEvidence
      ) {
        evidence.push(
          ...result.observerEvidence,
        );
      }
    }

    return res.json({
      tokenAddress:
        record.tokenAddress,

      evidence,
    });
  },
);

/* ============================================================
 * OBSERVER PERFORMANCE
 * ============================================================ */

app.get(
  '/api/observer/token/:address/performance',
  (req, res) => {
    const record =
      observerRecords.get(
        req.params.address,
      );

    if (!record) {
      return res.status(404).json({
        error:
          'observer token not found',
      });
    }

    const timeframeId =
      typeof req.query.timeframe ===
      'string'
        ? req.query.timeframe
        : null;

    if (timeframeId) {
      return res.json({
        tokenAddress:
          record.tokenAddress,

        timeframeId,

        performance:
          record
            .timeframeResults?.[
              timeframeId
            ]
            ?.observerPerformance ??
          null,
      });
    }

    const results =
      Object.entries(
        record.timeframeResults || {},
      );

    for (
      let i =
        results.length - 1;
      i >= 0;
      i--
    ) {
      const [
        id,
        result,
      ] = results[i];

      if (
        result?.status ===
          'FINALIZED' &&
        result?.observerPerformance
      ) {
        return res.json({
          tokenAddress:
            record.tokenAddress,

          timeframeId:
            id,

          performance:
            result.observerPerformance,
        });
      }
    }

    return res.json({
      tokenAddress:
        record.tokenAddress,

      timeframeId:
        null,

      performance:
        null,
    });
  },
);

/* ============================================================
 * OBSERVER PATH
 * ============================================================ */

app.get(
  '/api/observer/token/:address/path',
  (req, res) => {
    const record =
      observerRecords.get(
        req.params.address,
      );

    if (!record) {
      return res.status(404).json({
        error:
          'observer token not found',
      });
    }

    return res.json({
      tokenAddress:
        record.tokenAddress,

      path:
        record.path ??
        null,
    });
  },
);

/* ============================================================
 * TELEGRAM
 * ============================================================ */

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || '';

const TELEGRAM_CHAT_ID =
  process.env.TELEGRAM_CHAT_ID || '';

function telegramConfigured() {
  return Boolean(
    TELEGRAM_BOT_TOKEN &&
    TELEGRAM_CHAT_ID
  );
}

async function sendTelegramMessage(
  message,
  copyCa = null,
) {
  if (!telegramConfigured()) {
    throw new Error(
      'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
    );
  }

  const url =
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    disable_web_page_preview: true,
  };

  if (
    typeof copyCa === 'string' &&
    copyCa.trim()
  ) {
    body.reply_markup = {
      inline_keyboard: [
        [
          {
            text: '📋 COPY CA',
            copy_text: {
              text: copyCa.trim(),
            },
          },
        ],
      ],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.description ||
      `Telegram ${response.status}`,
    );
  }

  return data;
}

/* ============================================================
 * TELEGRAM STATUS
 * ============================================================ */

app.get(
  '/api/telegram/status',
  (_req, res) => {
    res.json({
      configured:
        telegramConfigured(),

      botTokenConfigured:
        Boolean(TELEGRAM_BOT_TOKEN),

      chatIdConfigured:
        Boolean(TELEGRAM_CHAT_ID),
    });
  },
);

/* ============================================================
 * TELEGRAM TEST
 * ============================================================ */

app.post(
  '/api/telegram/test',
  async (req, res) => {
    try {
      const message =
        typeof req.body?.message === 'string' &&
        req.body.message.trim()
          ? req.body.message.trim()
          : [
              '🧪 ChainScope Telegram Test',
              '',
              'Telegram alerts are connected.',
              '',
              `Time: ${new Date().toLocaleString()}`,
            ].join('\n');

      await sendTelegramMessage(message);

      res.json({
        ok: true,
        sent: true,
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * TELEGRAM ALERT
 * ============================================================ */

app.post(
  '/api/telegram/alert',
  async (req, res) => {
    try {
      const message =
        typeof req.body?.message === 'string' &&
        req.body.message.trim()
          ? req.body.message.trim()
          : '';

      const ca =
        typeof req.body?.ca === 'string' &&
        req.body.ca.trim()
          ? req.body.ca.trim()
          : null;

      if (!message) {
        return res.status(400).json({
          ok: false,
          error:
            'message is required',
        });
      }

      await sendTelegramMessage(
        message,
        ca,
      );

      return res.json({
        ok: true,
        sent: true,
        copyCa: Boolean(ca),
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * DISCOVERY
 * ============================================================ */

app.get(
  '/api/discovery',
  async (_req, res) => {
    try {
      const results =
        await Promise.allSettled([
          getDex(ENDPOINTS.profiles),
          getDex(ENDPOINTS.boostsLatest),
          getDex(ENDPOINTS.boostsTop),
        ]);

      const groups = [];

      const names = [
        'token-profiles-latest',
        'token-boosts-latest',
        'token-boosts-top',
      ];

      results.forEach(
        (result, index) => {
          if (
            result.status !==
            'fulfilled'
          ) {
            return;
          }

          const data =
            result.value;

          groups.push({
            source: names[index],
            items: Array.isArray(data)
              ? data
              : [],
          });
        },
      );

      const candidates =
        mergeCandidates(groups);

      res.json({
        fetchedAt:
          Date.now(),

        sources:
          names,

        count:
          candidates.length,

        candidates,
      });
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * TOKENS
 * ============================================================ */

app.get(
  '/api/tokens',
  async (req, res) => {
    try {
      const raw =
        String(
          req.query.addresses || '',
        );

      const addresses = [
        ...new Set(
          raw
            .split(',')
            .map(x => x.trim())
            .filter(Boolean),
        ),
      ].slice(0, 30);

      if (!addresses.length) {
        return res.status(400).json({
          error:
            'addresses query parameter is required',
        });
      }

      const data =
        await getDex(
          ENDPOINTS.tokens(
            'solana',
            addresses,
          ),
        );

      res.json(data);
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * TOKEN PAIRS
 * ============================================================ */

app.get(
  '/api/token-pairs/:address',
  async (req, res) => {
    try {
      const data =
        await getDex(
          ENDPOINTS.tokenPairs(
            'solana',
            req.params.address,
          ),
        );

      res.json(data);
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * SINGLE TOKEN
 * ============================================================ */

app.get(
  '/api/token/:address',
  async (req, res) => {
    try {
      const address =
        req.params.address;

      let tokenData =
        await getDex(
          ENDPOINTS.tokens(
            'solana',
            [address],
          ),
        );

      let pairs =
        Array.isArray(tokenData)
          ? tokenData
          : tokenData?.pairs || [];

      pairs = pairs.filter(
        pair =>
          pair?.chainId === 'solana',
      );

      if (!pairs.length) {
        const fallback =
          await getDex(
            ENDPOINTS.tokenPairs(
              'solana',
              address,
            ),
          );

        pairs =
          Array.isArray(fallback)
            ? fallback
            : fallback?.pairs || [];

        pairs = pairs.filter(
          pair =>
            pair?.chainId === 'solana',
        );
      }

      res.json({
        address,
        pairs,
      });
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * SEARCH
 * ============================================================ */

app.get(
  '/api/search',
  async (req, res) => {
    try {
      const query =
        String(
          req.query.q || '',
        ).trim();

      if (!query) {
        return res.status(400).json({
          error:
            'q query parameter is required',
        });
      }

      res.json(
        await getDex(
          ENDPOINTS.search(query),
        ),
      );
    } catch (error) {
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  },
);

/* ============================================================
 * FRONTEND
 * ============================================================ */

app.use(
  express.static(
    path.join(
      dir,
      '../dist',
    ),
  ),
);

/*
 * Express 5 compatible catch-all.
 * Do NOT use app.get('*') here.
 */

app.get(
  '/{*splat}',
  (_req, res) =>
    res.sendFile(
      path.join(
        dir,
        '../dist/index.html',
      ),
    ),
);

/* ============================================================
 * SERVER
 * ============================================================ */

app.listen(
  port,
  '0.0.0.0',
  () => {
    console.log(
      `ChainScope Progressive Alpha Pool listening on ${port}`,
    );

    console.log(
      `Telegram: ${
        telegramConfigured()
          ? 'configured'
          : 'not configured'
      }`,
    );
  },
);