# Deploying HVCTS to Azure

## Current deployment

Infrastructure is live in the Cognizant tenant (`cb6887677a-dseidemo-az`,
subscription `39e308a1-574e-4274-9265-786b64c6e5a0`), resource group
`rg-hvcts-dev-uks` (`uksouth`):

| Resource | Value |
|---|---|
| Web (use this) | `https://salmon-bush-0be50d503.3.azurestaticapps.net` |
| API (direct) | `https://hvcts-dev-api-st7getqn34vl6.azurewebsites.net` |
| API health | `https://hvcts-dev-api-st7getqn34vl6.azurewebsites.net/api/ai/health` |

**Entra ID sign-in is not configured** — this account's directory role
couldn't create the app registration (see "Deploying without Entra
sign-in"). Until `ENTRA_TENANT_ID` is set, pushes to `main` deploy a
**public** site whose `/api/ai/*` endpoints anyone can call. GitHub Actions
also authenticates to the API with a **publish profile**, not OIDC, for the
same directory-permission reason — see "Deploying without OIDC" below.

## Architecture

- **Frontend**: Azure Static Web Apps (Standard plan) serving the built SPA
  (`dist/`), with a **linked backend** so `/api/*` is proxied same-origin to
  the API — no CORS, and Static Web Apps' Entra ID sign-in gate covers the
  API too.
- **Backend**: Azure App Service (Linux, Node 22), running the compiled
  Express server (`dist-server/index.js`).
- **CI/CD**: GitHub Actions, `.github/workflows/azure-deploy.yml`. Push to
  `main` builds, deploys both, and smoke-tests the API. Pull requests get an
  SWA preview environment (frontend only — the API stays pointed at
  production; see "PR previews" below).

## Cost

Roughly **$22/month** excluding Azure OpenAI usage:

- Static Web Apps Standard: ~$9/month
- App Service B1 (Linux): ~$13/month
- Application Insights / Log Analytics: pay-as-you-go, negligible at this
  traffic level

The Standard SWA plan is required for linked backends and for the custom
OpenID Connect provider used for Entra ID sign-in — the Free tier only
supports SWA-managed Azure Functions as a backend.

## First-time setup

1. **Prerequisites**: Azure CLI (`az`) signed in (`az login`). No Bicep CLI
   needed — `setup-azure.sh` deploys `infra/main.json` (ARM JSON) directly.
   `infra/main.bicep` is kept as the readable source of truth; regenerate
   `main.json` from it with `az bicep build --file infra/main.bicep --outfile infra/main.json`
   if you edit the Bicep, on a machine that *can* run the Bicep CLI (`az
   bicep install` needs to download a binary from GitHub/ghcr release
   assets — blocked on networks with aggressive proxy filtering, which is
   why `main.json` was hand-authored instead of generated in this repo's
   case).

2. Confirm the target subscription:
   ```bash
   az account show
   az account set --subscription <id>   # if needed
   ```

3. Run the setup script:
   ```bash
   ./infra/setup-azure.sh --repo <owner>/<repo>
   ```
   It will:
   - Create the resource group (`rg-hvcts-dev-uks` by default, in
     `uksouth`).
   - Read the four `AZURE_OPENAI_*` values from your local `.env` if
     present, otherwise prompt for them.
   - Deploy `infra/main.json`: App Service, Static Web App, linked
     backend, Application Insights.
   - Try to create an Entra ID app registration for Static Web Apps
     sign-in, and a second one with a GitHub OIDC federated credential for
     passwordless CI/CD.
   - Print every GitHub secret/variable you need, and offer to set them
     automatically if the `gh` CLI is installed and authenticated.

   Preview the infrastructure changes first with `--what-if` if you want to
   review before deploying.

4. Set the printed secrets/variables in **GitHub → Settings → Secrets and
   variables → Actions** (or let the script's `gh` integration do it).

5. Push to `main`. The `azure-deploy.yml` workflow builds and deploys both
   the SPA and the API, then runs a smoke test against
   `/api/ai/health`.

### If your account can't create Entra app registrations

Common under locked-down Cognizant tenants. The script detects the
`Authorization_RequestDenied` failure and prints exactly what to hand to
someone with the **Application Developer** directory role:

- An app registration for **sign-in**: single-tenant, a web redirect URI of
  `https://<your-swa-host>/.auth/login/entra/callback`, ID token issuance
  enabled, with a client secret.
- An app registration for **GitHub OIDC**: no redirect URI needed, just a
  federated credential trusting
  `repo:<owner>/<repo>:ref:refs/heads/main` and
  `repo:<owner>/<repo>:environment:production`, plus Contributor on the
  resource group.

Everything else (App Service, Static Web App, linked backend) deploys fine
without either. See "Deploying without OIDC" and "Deploying without Entra
sign-in" below for what to do meanwhile.

### Deploying without OIDC (the current default)

`deploy-api` in `.github/workflows/azure-deploy.yml` authenticates with a
**publish profile**, not OIDC — this Cognizant tenant's directory
permissions didn't allow creating the app registration OIDC needs, so this
is what's actually wired up:

```bash
az webapp deployment list-publishing-profiles --name <api-name> \
  --resource-group <rg> --xml
```

The XML goes in the `AZURE_WEBAPP_PUBLISH_PROFILE` GitHub secret. Publish
profiles are long-lived credentials, not scoped per-repo — rotate them
periodically from the portal (App Service → Get publish profile → Reset),
or via the command above (each call issues a fresh one; the old one keeps
working until rotated).

To switch to OIDC later, once someone with the Application Developer
directory role creates the two app registrations `infra/setup-azure.sh`
describes: swap the `deploy-api` job's auth step back to

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: azure/login@v2
    with:
      client-id: ${{ secrets.AZURE_CLIENT_ID }}
      tenant-id: ${{ secrets.AZURE_TENANT_ID }}
      subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
  - uses: azure/webapps-deploy@v3
    with:
      app-name: ${{ vars.AZURE_WEBAPP_NAME }}
      resource-group: ${{ vars.AZURE_RESOURCE_GROUP }}
      package: api.zip
```

### Deploying without Entra sign-in

Leave the `ENTRA_TENANT_ID` repository variable unset. The build step
(`scripts/prepare-swa-config.mjs`) detects this and strips the `auth` block
and role restrictions from `dist/staticwebapp.config.json`, producing a
**publicly accessible** deployment — a warning is printed in the workflow
log. Set `ENTRA_TENANT_ID` (and the SWA `ENTRA_CLIENT_ID`/
`ENTRA_CLIENT_SECRET` app settings) at any time and the next push locks it
back down.

## GitHub configuration reference

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Used by | Source |
|---|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `deploy-web` | `az staticwebapp secrets list` |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | `deploy-api` (current default — see "Deploying without OIDC") | `az webapp deployment list-publishing-profiles --xml` |
| `AZURE_CLIENT_ID` | `deploy-api`, only if switched to OIDC | The GitHub-OIDC app registration's app id |
| `AZURE_TENANT_ID` | `deploy-api`, only if switched to OIDC | `az account show --query tenantId` |
| `AZURE_SUBSCRIPTION_ID` | `deploy-api`, only if switched to OIDC | `az account show --query id` |

**Variables** (same location, "Variables" tab):

| Variable | Used by | Source |
|---|---|---|
| `AZURE_WEBAPP_NAME` | `deploy-api` | ARM template output `apiName` |
| `AZURE_RESOURCE_GROUP` | `deploy-api`, only if switched to OIDC | The resource group name |
| `ENTRA_TENANT_ID` | `deploy-web` | Set only once Entra sign-in is configured; unset = public deployment |

**Environment**: `deploy-api` runs under the `production` GitHub
Environment (Settings → Environments) — add required reviewers there if
you want a manual approval gate before the API redeploys.

## PR previews

Every PR against `main` gets its own Static Web Apps preview URL, posted as
a PR comment by `Azure/static-web-apps-deploy@v1`, and torn down
automatically by `.github/workflows/azure-swa-close-pr.yml` when the PR
closes. The preview frontend calls the **production** API — there is no
per-PR API environment. If you need isolated end-to-end previews, add a
deployment slot to the App Service and route to it based on
`github.event.pull_request.number`.

## Rollback

- **Frontend**: Azure Static Web Apps keeps recent deployments; revert by
  re-running the `deploy-web` job from an earlier successful workflow run
  (Actions → select the run → "Re-run jobs"), or `git revert` the
  offending commit and push.
- **API**: `git revert` and push is the primary path, since `deploy-api`
  redeploys from source each time. For an immediate rollback without
  waiting on CI, redeploy a previously built `api.zip` (download it from
  the Actions run's artifacts, if you add artifact upload — not enabled by
  default to save storage) via:
  ```bash
  az webapp deploy --resource-group <rg> --name <api-name> --src-path api.zip --type zip
  ```

## The SWA Free-tier fallback (documented, not the default)

If the $9/month Standard plan isn't approved, you can run the SPA on the
**Free** tier instead, at the cost of losing the linked backend, same-origin
`/api/*` calls, and the Entra gate covering the API:

1. Deploy the API to App Service as usual (Bicep already does this
   independently of the SWA tier).
2. Set the SPA's build-time `VITE_API_BASE_URL` to the full API URL (e.g.
   `https://hvcts-dev-api-xxxx.azurewebsites.net/api/ai`) — `src/services/llm.ts`
   already reads this variable.
3. Set `ALLOWED_ORIGINS` on the App Service to the SWA's `*.azurestaticapps.net`
   origin so CORS allows the cross-origin calls.
4. Drop the SKU in `infra/main.bicep` (and `infra/main.json`) `staticSites`
   resource to `Free`, and remove the `linkedBackends` resource (Free tier
   rejects it).
5. Protect the app some other way — Free tier has no custom OIDC provider,
   so Entra sign-in as configured here won't work; either accept a public
   frontend (the API's `REQUIRE_SWA_AUTH` guard becomes moot too, since
   there's no SWA principal to check) or front the App Service with Azure AD
   App Service "Easy Auth" instead and drop the SPA-side gate entirely.

## Known constraints worth re-reading before a real (non-mock) rollout

- **Region**: Azure OpenAI is in Sweden Central; the sovereignty rule in
  `../solution-architecture.md` calls for UK-only inference. Fine for mock
  data, not for real HMRC data.
- **Access control**: entirely at the infrastructure layer (SWA + Entra).
  The Express API has no session/user model of its own — `REQUIRE_SWA_AUTH`
  only checks that *a* signed-in principal reached it, not who.
- **Rate limiting**: in-process, per App Service instance. If you scale the
  plan beyond one instance, the effective per-user limit multiplies by the
  instance count — move to a shared store (e.g. Azure Cache for Redis) if
  that matters.
- **No tests**: `validate` in CI only lints and typechecks. There is no
  regression safety net beyond the `smoke` job's health check.
