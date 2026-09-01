import 'dotenv/config';
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
} from './llmService.js';
import type { CaseContext } from './contextFabric.js';
import { corsOptions, decodeSwaPrincipal, rateLimit, requireSwaPrincipal } from './security.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Azure App Service terminates TLS at the front end, so req.ip must come
// from X-Forwarded-For for rate limiting to key on the real client.
app.set('trust proxy', 1);

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// ─── Service root ────────────────────────────────────────────────────
//
// The SPA is served by Static Web Apps, not from here. Answer the root so
// that hitting the App Service hostname directly is self-explanatory.

app.get('/', (_req, res) => {
  res.json({ service: 'hvcts-api', endpoints: ['/api/ai/health', '/api/ai/*'] });
});

// ─── Health check ────────────────────────────────────────────────────
//
// Deliberately unauthenticated so the deployment smoke test can reach it.
// Configuration detail is only disclosed to an authenticated caller.

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
// Registered as path-scoped middleware AFTER the health route above, so
// health stays reachable while everything else must pass all three. One
// shared rate limiter, so the budget is per-user across all AI endpoints
// rather than per-endpoint.

app.use('/api/ai', requireSwaPrincipal);
app.use(
  '/api/ai',
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  }),
);
app.use('/api/ai', requireLlm);

// ─── Helper: extract CaseContext from request body ───────────────────

function extractCaseContext(body: Record<string, unknown>): CaseContext {
  return {
    reference: String(body.reference || ''),
    challengeType: String(body.challengeType || ''),
    propertyAddress: String(body.propertyAddress || ''),
    hvctsBand: String(body.hvctsBand || ''),
    estimatedValue: Number(body.estimatedValue || 0),
    annualSurcharge: Number(body.annualSurcharge || 0),
    ownershipType: String(body.ownershipType || ''),
    liableEntity: String(body.liableEntity || ''),
    ownershipConfidence: Number(body.ownershipConfidence || 0),
    evidenceSummary: String(body.evidenceSummary || ''),
    comparablesSummary: String(body.comparablesSummary || ''),
    padSummary: String(body.padSummary || ''),
    aiConfidence: Number(body.aiConfidence || 0),
  };
}

// ─── API Routes ──────────────────────────────────────────────────────

app.post('/api/ai/case-brief', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const result = await generateCaseBrief(ctx);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[case-brief]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/ai/research', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const result = await generateResearch(ctx);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[research]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/ai/evidence', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const result = await assessEvidence(ctx);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[evidence]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/ai/decision', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const result = await generateDecision(ctx);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[decision]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/ai/decision-letter', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const decision = String(req.body.decision || 'maintain band');
    const result = await generateDecisionLetter(ctx, decision);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[decision-letter]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/ai/ownership', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const result = await analyseOwnership(ctx);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[ownership]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

app.post('/api/ai/dlm', async (req, res) => {
  try {
    const ctx = extractCaseContext(req.body);
    const result = await assessDlmImpact(ctx);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    console.error('[dlm]', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  HVCTS API server listening on port ${PORT}`);
  console.log(`  Azure OpenAI: ${isConfigured() ? `configured (${process.env.AZURE_OPENAI_DEPLOYMENT_NAME})` : 'NOT configured — set .env values'}`);
  console.log(`  SWA auth required: ${process.env.REQUIRE_SWA_AUTH === 'true'}`);
  console.log(`  CORS allowlist: ${process.env.ALLOWED_ORIGINS || '(all origins)'}`);
  console.log(`  Health check: /api/ai/health\n`);
});
