import 'dotenv/config';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import cors from 'cors';
import {
  isConfigured,
  generateCaseBrief,
  generateResearch,
  assessEvidence,
  generateDecision,
  generateDecisionLetter,
  analyseOwnership,
  assessDlmImpact,
  askAssistant,
} from './llmService.js';
import type { CaseContext } from './contextFabric.js';
import { corsOptions, decodeSwaPrincipal, rateLimit, requireSwaPrincipal } from './security.js';

const execFileAsync = promisify(execFile);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Azure App Service terminates TLS at the front end, so req.ip must come from
// X-Forwarded-For for rate limiting to key on the real client.
app.set('trust proxy', 1);

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// ─── Service root ────────────────────────────────────────────────────
//
// The SPA is served by Static Web Apps, not from here. Answer the root so
// that hitting the App Service hostname directly is self-explanatory.

app.get('/', (_req, res) => {
  res.json({ service: 'hvcts-api', endpoints: ['/api/ai/health', '/api/ai/*', '/api/buildings', '/api/epc'] });
});

// ─── Health check ────────────────────────────────────────────────────
//
// Deliberately unauthenticated and registered before the /api/ai guards so
// the deployment smoke test can reach it. Configuration detail is only
// disclosed to a caller that carries a Static Web Apps principal.

app.get('/api/ai/health', (req, res) => {
  const principal = decodeSwaPrincipal(req);
  res.json({
    status: 'ok',
    configured: isConfigured(),
    deployment: principal ? process.env.AZURE_OPENAI_DEPLOYMENT_NAME || null : null,
    timestamp: new Date().toISOString(),
  });
});

// ─── Middleware: validate LLM configuration ──────────────────────────

function requireLlm(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isConfigured()) {
    res.status(503).json({
      error: 'Azure OpenAI not configured',
      message: 'The AI service is not available. Contact the service administrator.',
      fallback: true,
    });
    return;
  }
  next();
}

// ─── Guards applied to every AI endpoint ─────────────────────────────
//
// Path-scoped and registered AFTER the health route above, so health stays
// reachable while everything else must pass all three. One shared rate
// limiter, so the budget is per-user across all AI endpoints rather than
// per-endpoint — this is what caps Azure OpenAI spend on a public deployment.

app.use(
  '/api/ai',
  requireSwaPrincipal,
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  }),
  requireLlm,
);

// ─── Helper: extract CaseContext from request body ───────────────────
//
// Every field is coerced and length-capped. The cap matters because these
// values are interpolated straight into the LLM prompt, and on a public
// deployment the request body is attacker-controlled.

const MAX_FIELD = 4000;

function str(value: unknown): string {
  return String(value ?? '').slice(0, MAX_FIELD);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractCaseContext(body: Record<string, unknown>): CaseContext {
  return {
    reference: str(body.reference),
    challengeType: str(body.challengeType),
    propertyAddress: str(body.propertyAddress),
    hvctsBand: str(body.hvctsBand),
    estimatedValue: num(body.estimatedValue),
    annualSurcharge: num(body.annualSurcharge),
    ownershipType: str(body.ownershipType),
    liableEntity: str(body.liableEntity),
    ownershipConfidence: num(body.ownershipConfidence),
    evidenceSummary: str(body.evidenceSummary),
    comparablesSummary: str(body.comparablesSummary),
    padSummary: str(body.padSummary),
    aiConfidence: num(body.aiConfidence),
  };
}

// ─── Helper: uniform error response ──────────────────────────────────
//
// The underlying message can carry the Azure endpoint and deployment name,
// so it is logged server-side and never returned to the caller.

function fail(label: string, err: unknown, res: express.Response) {
  console.error(`[${label}]`, err);
  res.status(500).json({ success: false, error: 'The AI service could not complete this request.' });
}

// ─── API Routes ──────────────────────────────────────────────────────

app.post('/api/ai/case-brief', async (req, res) => {
  try {
    const result = await generateCaseBrief(extractCaseContext(req.body));
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('case-brief', err, res);
  }
});

app.post('/api/ai/research', async (req, res) => {
  try {
    const result = await generateResearch(extractCaseContext(req.body));
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('research', err, res);
  }
});

app.post('/api/ai/evidence', async (req, res) => {
  try {
    const result = await assessEvidence(extractCaseContext(req.body));
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('evidence', err, res);
  }
});

app.post('/api/ai/decision', async (req, res) => {
  try {
    const result = await generateDecision(extractCaseContext(req.body));
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('decision', err, res);
  }
});

app.post('/api/ai/decision-letter', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const decision = str(req.body.decision) || 'maintain band';
    const result = await generateDecisionLetter(ctx, decision);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('decision-letter', err, res);
  }
});

app.post('/api/ai/ownership', async (req, res) => {
  try {
    const result = await analyseOwnership(extractCaseContext(req.body));
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('ownership', err, res);
  }
});

app.post('/api/ai/dlm', async (req, res) => {
  try {
    const result = await assessDlmImpact(extractCaseContext(req.body));
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('dlm', err, res);
  }
});

app.post('/api/ai/assistant', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const question = str(req.body.question);
    const history = req.body.conversationHistory ? str(req.body.conversationHistory) : undefined;
    if (!question) {
      res.status(400).json({ success: false, error: 'Question is required' });
      return;
    }
    const result = await askAssistant(ctx, question, history);
    res.json({ success: true, data: { answer: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('assistant', err, res);
  }
});

// ─── External API proxies ────────────────────────────────────────────
//
// These exist to keep the browser off origins that either lack CORS headers
// or would need to be allowlisted in the Content-Security-Policy.
//
// Transport: fetch first, curl as a fallback.
//
// In Azure, fetch is the right tool and the only one that works — the App
// Service container has no guaranteed curl binary. On a corporate network
// that intercepts TLS, the opposite is true: Node rejects the substituted
// certificate chain ("unable to get local issuer certificate") while curl,
// which trusts the system keychain, succeeds. The original code shelled out
// to `execSync('curl -sk ...')` for exactly this reason, but that blocked
// the event loop for up to 22s per request — stalling concurrent LLM calls —
// and `-k` disabled certificate verification outright.
//
// So: try fetch, and only if it fails at the network layer fall back to curl
// via execFile, which is async and does not block. Verification stays on in
// both paths; there is no `-k`.

interface FetchResult {
  status: number;
  body: string;
}

interface FetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutSec?: number;
}

/** True once fetch has failed at the network layer, so we stop retrying it. */
let fetchIsBlocked = false;

async function curlFetch(url: string, opts?: FetchOptions): Promise<FetchResult> {
  const timeoutSec = opts?.timeoutSec || 15;
  const args = ['-s', '-L', '--max-time', String(timeoutSec)];
  if (opts?.method && opts.method !== 'GET') args.push('-X', opts.method);
  if (opts?.body) args.push('--data-binary', opts.body);
  for (const [key, value] of Object.entries(opts?.headers || {})) {
    args.push('-H', `${key}: ${value}`);
  }
  args.push('-w', '\n%{http_code}', url);

  // execFile, not execSync: arguments are passed as an array so there is no
  // shell to quote against, and the call does not block the event loop.
  const { stdout } = await execFileAsync('curl', args, {
    encoding: 'utf-8',
    timeout: timeoutSec * 1000 + 2000,
    maxBuffer: 32 * 1024 * 1024,
  });

  const lines = stdout.trimEnd().split('\n');
  const status = parseInt(lines.pop() || '0', 10) || 0;
  return { status, body: lines.join('\n') };
}

async function httpFetch(url: string, opts?: FetchOptions): Promise<FetchResult> {
  if (!fetchIsBlocked) {
    try {
      const response = await fetch(url, {
        method: opts?.method || 'GET',
        body: opts?.body,
        headers: opts?.headers,
        signal: AbortSignal.timeout((opts?.timeoutSec || 15) * 1000),
      });
      return { status: response.status, body: await response.text() };
    } catch (err) {
      // A timeout or abort is a real result, not a broken transport.
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw err;
      fetchIsBlocked = true;
      console.warn(`  fetch unavailable (${(err as Error).message}) — falling back to curl for outbound calls`);
    }
  }

  return curlFetch(url, opts);
}

// In-memory cache: coord key → { elements, timestamp }. Per-instance, so it
// is a cold-start miss on scale-out; adequate for a single-instance prototype.
const buildingCache = new Map<string, { elements: unknown[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

// Load pre-fetched building footprints from disk.
//
// Stored gzipped: the raw JSON is 1.5 MB, which compresses to 248 KB. That
// keeps it out of git-LFS territory, shrinks the App Service deploy package,
// and — the reason it was done — a 1.5 MB blob in a single push is large
// enough for a TLS-intercepting corporate proxy to reject the POST with a
// bare 403.
//
// `build:server` copies the archive next to the compiled output, so
// import.meta.dirname resolves in both `tsx server/index.ts` (dev) and
// `node dist-server/index.js` (production); cwd covers any other layout, and
// a plain .json is still accepted so the file can be regenerated uncompressed.
function loadBuildingCache() {
  const names = ['building-cache.json.gz', 'building-cache.json'];
  const dirs = [import.meta.dirname, path.join(process.cwd(), 'server'), process.cwd()];
  const candidates = dirs.flatMap((dir) => names.map((name) => path.join(dir, name)));

  for (const cacheFile of candidates) {
    try {
      const raw = fs.readFileSync(cacheFile);
      const json = cacheFile.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf-8') : raw.toString('utf-8');
      const data = JSON.parse(json) as Record<string, unknown[]>;
      let count = 0;
      for (const [key, elements] of Object.entries(data)) {
        if (Array.isArray(elements) && elements.length > 0) {
          buildingCache.set(key, { elements, ts: Date.now() });
          count += elements.length;
        }
      }
      console.log(`  Building cache: ${buildingCache.size} locations, ${count} footprints from ${cacheFile}`);
      return;
    } catch {
      // Try the next candidate path.
    }
  }

  console.warn('  Building cache: no pre-fetched data found — falling back to live Overpass calls');
}

loadBuildingCache();

app.get('/api/buildings', async (req, res) => {
  const lat = parseFloat(String(req.query.lat));
  const lng = parseFloat(String(req.query.lng));
  const radius = Math.min(parseFloat(String(req.query.radius || '150')) || 150, 300);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ elements: [] });
    return;
  }

  // Integer key matching pre-fetched cache format (~11m precision)
  const cacheKey = `${Math.round(lat * 10000)},${Math.round(lng * 10000)},${radius}`;

  const cached = buildingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log(`[buildings] Cache hit: ${cached.elements.length} footprints for ${cacheKey}`);
    res.json({ elements: cached.elements });
    return;
  }

  const dlat = radius / 111320;
  const dlng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dlat},${lng - dlng},${lat + dlat},${lng + dlng}`;
  const query = `[out:json][timeout:10];way["building"](${bbox});out geom;`;

  const OVERPASS_ENDPOINTS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const host = endpoint.split('/')[2];
      try {
        const result = await httpFetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': '*/*',
            'User-Agent': 'HVCTS/1.0',
          },
          timeoutSec: 20,
        });

        if (result.status === 429 || result.status === 504) {
          console.log(`[buildings] ${host} → ${result.status}, retry ${attempt + 1}`);
          continue;
        }

        if (result.status < 200 || result.status >= 300) {
          console.log(`[buildings] ${host} → ${result.status}`);
          break;
        }

        const data = JSON.parse(result.body) as { elements?: unknown[] };
        const elements = data.elements || [];
        console.log(`[buildings] ${elements.length} footprints from ${host}`);
        if (elements.length > 0) {
          buildingCache.set(cacheKey, { elements, ts: Date.now() });
        }
        res.json({ elements });
        return;
      } catch (err) {
        console.log(`[buildings] ${host} failed: ${(err as Error).message}`);
        break;
      }
    }
  }

  res.json({ elements: [] });
});

app.get('/api/epc', async (req, res) => {
  const postcode = String(req.query.postcode || '').slice(0, 16);
  if (!postcode) {
    res.json({ rows: [] });
    return;
  }

  // NOTE: the endpoint below no longer serves data. epc.opendatacommunities.org
  // has been retired and 301s to a GOV.UK HTML landing page, so this returns no
  // rows no matter what. It also always required Basic auth with a registered
  // email and key, which this deployment does not have.
  //
  // To restore EPC data: register for the replacement service, set
  // EPC_API_BASE_URL to its search endpoint and EPC_API_EMAIL / EPC_API_KEY.
  // Until then the UI degrades to no EPC rows, which it already handles.
  const baseUrl = process.env.EPC_API_BASE_URL
    || 'https://epc.opendatacommunities.org/api/v1/domestic/search';
  const email = process.env.EPC_API_EMAIL;
  const apiKey = process.env.EPC_API_KEY;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (email && apiKey) {
    headers.Authorization = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`;
  }

  try {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const result = await httpFetch(
      `${baseUrl}${separator}postcode=${encodeURIComponent(postcode)}&size=10`,
      { headers, timeoutSec: 8 },
    );

    if (result.status < 200 || result.status >= 300) {
      console.log(`[epc] ${result.status}${result.status === 401 ? ' — set EPC_API_EMAIL and EPC_API_KEY' : ''}`);
      res.json({ rows: [] });
      return;
    }

    // The retired endpoint answers 200 with an HTML page. Fail loudly in the
    // log rather than surfacing a JSON parse error as a 500.
    const trimmed = result.body.trimStart();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      console.warn('[epc] upstream returned a non-JSON response — the EPC API endpoint has moved. Set EPC_API_BASE_URL.');
      res.json({ rows: [] });
      return;
    }

    res.json(JSON.parse(trimmed));
  } catch (err) {
    console.error('[epc]', (err as Error).message);
    res.json({ rows: [] });
  }
});

// ─── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  HVCTS API server listening on port ${PORT}`);
  console.log(`  Azure OpenAI: ${isConfigured() ? `configured (${process.env.AZURE_OPENAI_DEPLOYMENT_NAME})` : 'NOT configured — set .env values'}`);
  console.log(`  SWA auth required: ${process.env.REQUIRE_SWA_AUTH === 'true'}`);
  console.log(`  CORS allowlist: ${process.env.ALLOWED_ORIGINS || '(all origins)'}`);
  console.log(`  Rate limit: ${process.env.RATE_LIMIT_MAX || '30'} AI requests / ${Math.round(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000', 10) / 60000)} min`);
  console.log(`  Health check: /api/ai/health\n`);
});
