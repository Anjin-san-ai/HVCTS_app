import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { isConfigured } from './llmService.js';
import aiRoutes from './routes/ai.js';
import proxyRoutes, { initCache } from './routes/proxy.js';
import companiesRoutes from './routes/companies.js';
import { corsOptions, decodeSwaPrincipal, rateLimit, requireSwaPrincipal } from './security.js';
import type { AgentCapability, AgentRequest } from './agents/types.js';
import {
  getOrchestrator,
  ValuationAgent,
  EvidenceAgent,
  DecisionAgent,
  OwnershipAgent,
  AssistantAgent,
} from './agents/index.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Azure App Service terminates TLS at the front end, so req.ip must come from
// X-Forwarded-For for rate limiting to key on the real client.
app.set('trust proxy', 1);

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// ─── Service root ───────────────────────────────────────────────────
//
// The SPA is served by Static Web Apps, not from here. Answer the root so
// that hitting the App Service hostname directly is self-explanatory.

app.get('/', (_req, res) => {
  res.json({
    service: 'hvcts-api',
    endpoints: ['/api/ai/health', '/api/ai/*', '/api/agent/*', '/api/companies/*', '/api/buildings', '/api/epc'],
  });
});

// ─── Health check ───────────────────────────────────────────────────
//
// Deliberately unauthenticated and registered before the guards below so the
// deployment smoke test can reach it. Configuration detail is only disclosed
// to a caller that carries a Static Web Apps principal.

app.get('/api/ai/health', (req, res) => {
  const principal = decodeSwaPrincipal(req);
  res.json({
    status: 'ok',
    configured: isConfigured(),
    deployment: principal ? process.env.AZURE_OPENAI_DEPLOYMENT_NAME || null : null,
    timestamp: new Date().toISOString(),
  });
});

// ─── Guards applied to every metered endpoint ───────────────────────
//
// Path-scoped and registered AFTER the health route above, so health stays
// reachable while everything else must pass both. One shared rate limiter
// instance across all three paths, so the budget is per-user across every
// metered endpoint rather than per-endpoint — this is what caps Azure OpenAI
// spend on a public deployment.
//
// /api/agent/* is included because the orchestrator routes straight through
// to the same LLM; guarding only /api/ai would leave the ceiling bypassable.
// /api/companies/* is included because it burns a rate-limited third-party
// API key.

const meteredGuard = [
  requireSwaPrincipal,
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  }),
];

app.use('/api/ai', ...meteredGuard);
app.use('/api/agent', ...meteredGuard);
app.use('/api/companies', ...meteredGuard);

// ─── Route modules ──────────────────────────────────────────────────

app.use('/api/ai', aiRoutes);
app.use('/api', proxyRoutes);
app.use('/api/companies', companiesRoutes);

// ─── Agent orchestrator ─────────────────────────────────────────────

const orchestrator = getOrchestrator({ maxConcurrentAgents: 5, defaultTimeout: 30_000 });
orchestrator.register(new ValuationAgent());
orchestrator.register(new EvidenceAgent());
orchestrator.register(new DecisionAgent());
orchestrator.register(new OwnershipAgent());
orchestrator.register(new AssistantAgent());

orchestrator.onEvent(event => {
  if (event.type === 'agent_completed') {
    console.log(`[orchestrator] ${event.agentName} completed ${event.capability} in ${event.duration}ms`);
  }
  if (event.type === 'agent_failed') {
    console.error(`[orchestrator] ${event.agentName} failed: ${event.error}`);
  }
});

// Orchestrator endpoint — route requests to agents
app.post('/api/agent/route', async (req, res) => {
  try {
    const { capability, payload, context, priority } = req.body;
    if (!capability) {
      res.status(400).json({ error: 'capability is required' });
      return;
    }
    const result = await orchestrator.route({
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      capability,
      payload: payload || {},
      context: context || {},
      priority: priority || 'normal',
    });
    res.json(result);
  } catch (err: unknown) {
    console.error('[agent/route]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Parallel orchestrator endpoint — execute multiple agents concurrently
app.post('/api/agent/parallel', async (req, res) => {
  try {
    const { requests } = req.body;
    if (!Array.isArray(requests)) {
      res.status(400).json({ error: 'requests must be an array' });
      return;
    }
    const agentRequests = requests.map((r: Record<string, unknown>, i: number) => ({
      id: `par-${Date.now()}-${i}`,
      capability: r.capability as AgentCapability,
      payload: r.payload || {},
      context: r.context || {},
      priority: (r.priority as AgentRequest['priority']) || 'normal',
    }));
    const results = await orchestrator.parallel(agentRequests);
    res.json({ results });
  } catch (err: unknown) {
    console.error('[agent/parallel]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Orchestrator introspection
app.get('/api/agent/registry', (_req, res) => {
  const agents = orchestrator.getAllAgents().map(a => ({
    name: a.name,
    capabilities: a.capabilities,
    description: a.description,
  }));
  res.json({ agents, count: agents.length });
});

// ─── Start ──────────────────────────────────────────────────────────

const CH_KEY = (process.env.CompanySearch || process.env.COMPANIES_HOUSE_API_KEY || '').replace(/^["']|["']$/g, '');

async function start() {
  await initCache();

  app.listen(PORT, () => {
    console.log(`\n  HVCTS API server running on http://localhost:${PORT}`);
    console.log(`  Azure OpenAI: ${isConfigured() ? `configured (${process.env.AZURE_OPENAI_DEPLOYMENT_NAME})` : 'NOT configured — set .env values'}`);
    console.log(`  Companies House: ${CH_KEY ? 'configured' : 'demo mode (set COMPANIES_HOUSE_API_KEY for live data)'}`);
    console.log(`  Agent orchestrator: ${orchestrator.getAllAgents().length} agents registered`);
    console.log(`  Health check: http://localhost:${PORT}/api/ai/health\n`);
  });
}

start();
