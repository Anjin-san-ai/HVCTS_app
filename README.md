# HVCTS — AI-Augmented Dispute Resolution (Prototype)

A working prototype for **HVCTS (High Value Council Tax Surcharge)**: an HMRC/VOA
service for a new surcharge on English residential properties valued above
~£2M. Unlike standard Council Tax, HVCTS liability attaches to the **property
owner**, not the occupier — which is what makes ownership resolution,
valuation challenges, and evidence review the hard parts of this service.

The app has two journeys:

- **Customer** (`/`, `/search`, `/results`, `/property`, `/liability`,
  `/challenge`, `/evidence`, `/review`, `/confirmation`) — a property owner
  searches their property, sees its HVCTS band and liability, and can
  challenge the valuation with evidence.
- **Caseworker** (`/caseworker`, `/caseworker/case`) — a VOA caseworker
  triages cases and gets AI-generated case briefs, desktop research,
  evidence assessment, decision recommendations, and draft decision letters.

This is a **prototype with mock case data** (`src/data/properties.ts`), not
the production HVCTS system described in the wider design documents (see
`../solution-architecture.md`, `../technical-design-spec.md`), whose target
architecture is AWS-primary with Azure UK South as DR. This app's deployment
target is Azure only, scoped to make the prototype demoable and
redeployable — see `docs/DEPLOYMENT.md`.

## Architecture

```
Browser
  │
  ▼
Azure Static Web Apps (SPA, dist/)
  ├── /*      → React app (client-side routes, no server rendering)
  └── /api/*  → linked backend ──▶ Azure App Service (Express API)
                                        │
                                        ▼
                                Azure OpenAI (case briefs, research,
                                evidence assessment, decision letters)

Public data — called directly from the browser, no backend involved:
  postcodes.io · HM Land Registry · EPC Open Data · Environment Agency
  Flood Monitoring · police.uk · planning.data.gov.uk · OSM Overpass
```

- **Frontend**: React 19 + React Router 7 + Zustand, built with Vite.
- **Backend**: Express 5, calling Azure OpenAI via the `openai` SDK's
  `AzureOpenAI` client. Domain prompts live in `server/contextFabric.ts`.
- **Data**: no database. Case/property data is hardcoded
  (`src/data/properties.ts`); live UK public data is fetched client-side
  (`src/services/api.ts`, `src/services/publicData.ts`).

## Prerequisites

- Node.js **22.12+** (see `.nvmrc`) — the repo targets 22 LTS for parity with
  Azure App Service; a newer local Node may build but is not what CI/prod run.
- An Azure OpenAI resource with a chat-completions deployment.

## Local development

```bash
npm install
cp .env.example .env   # then fill in the four AZURE_OPENAI_* values
npm run dev             # Vite dev server (5173) + API server (3001), concurrently
```

The Vite dev server proxies `/api/*` to `http://localhost:3001` (see
`vite.config.ts`) — that proxy only exists in dev; production same-origin
routing is handled by the Static Web Apps linked backend instead (see
`docs/DEPLOYMENT.md`).

If Azure OpenAI isn't configured, the app still runs: AI panels on the
caseworker case page show a 503/"not configured" state instead of crashing.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite + API server together, for local development |
| `npm run build` | Typecheck + build the SPA to `dist/` |
| `npm run build:server` | Compile `server/` (TypeScript) to `dist-server/` |
| `npm run build:all` | Both of the above |
| `npm start` | Run the **compiled** server (`node dist-server/index.js`) — what production runs |
| `npm run typecheck` | Typecheck app and server without emitting |
| `npm run lint` | oxlint |
| `npm run preview` | Preview the built SPA (`dist/`) without the dev proxy — the closest local approximation of production static hosting |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | yes | Azure OpenAI resource endpoint |
| `OPENAI_API_VERSION` | yes | API version, e.g. `2025-01-01-preview` |
| `AZURE_OPENAI_API_KEY` | yes | Azure OpenAI key (never commit; `.env` is gitignored) |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | yes | Chat deployment name, e.g. `gpt-5.5` |
| `AZURE_OPENAI_SUPPORTS_TEMPERATURE` | no | `true` only for non-reasoning models (gpt-4o and earlier); reasoning models reject a non-default temperature |
| `PORT` | no | API port, default `3001` |
| `ALLOWED_ORIGINS` | no | Comma-separated CORS allowlist; unset = allow all (local dev default) |
| `REQUIRE_SWA_AUTH` | no | `true` in production — rejects API calls that didn't arrive via an authenticated Static Web Apps session |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | no | Per-user AI request budget, default 30 per 5 minutes |

Full deployment configuration (Azure, GitHub Actions, secrets) is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Project structure

```
server/            Express API — routes, security middleware, Azure OpenAI client, domain prompts
src/
  pages/customer/   9-step customer journey
  pages/caseworker/ Dashboard + case detail
  components/       ResearchMap (Leaflet), layout (Header/Footer/Nav), common
  services/         llm.ts (backend AI calls), api.ts + publicData.ts (public UK data)
  data/             Mock property/case data
  stores/           Zustand app state
infra/              Bicep IaC + one-time Azure setup script
.github/workflows/  CI/CD to Azure on push to main
```

## Known prototype caveats

- Azure OpenAI is deployed in **Sweden Central**, not UK South — acceptable
  for mock data, but a real-data deployment would need a UK South Azure
  OpenAI resource to meet the sovereignty constraint stated in
  `../solution-architecture.md`.
- No authentication in the app itself — access control is provided entirely
  by the Azure Static Web Apps Entra ID sign-in gate at the infrastructure
  layer.
- No automated tests exist yet.
