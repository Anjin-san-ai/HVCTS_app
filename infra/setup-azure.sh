#!/usr/bin/env bash
#
# One-time Azure setup for the HVCTS prototype.
#
# Creates the resource group, deploys infra/main.bicep (App Service + Static
# Web App + linked backend + Application Insights), optionally creates the two
# Entra app registrations (Static Web Apps sign-in, GitHub OIDC), and prints
# the GitHub secrets and variables to configure.
#
# Safe to re-run: every step is idempotent and nothing is destructive.
#
# Usage:
#   ./infra/setup-azure.sh --repo <owner>/<repo> [options]
#
# Options:
#   --repo <owner/repo>    GitHub repository, for the OIDC federated credential
#   --subscription <id>    Azure subscription id (default: current)
#   --resource-group <n>   Resource group name (default: rg-hvcts-dev-uks)
#   --name-prefix <p>      Resource name prefix (default: hvcts)
#   --env <e>              Environment discriminator (default: dev)
#   --api-location <r>     App Service region (default: uksouth)
#   --swa-location <r>     Static Web Apps region (default: westeurope)
#   --skip-entra-auth      Do not create the sign-in app registration
#   --skip-oidc            Do not create the GitHub OIDC app registration
#   --what-if              Show the infrastructure diff and exit
#   -h, --help             Show this help

set -euo pipefail

REPO=""
SUBSCRIPTION=""
RESOURCE_GROUP="rg-hvcts-dev-uks"
NAME_PREFIX="hvcts"
ENVIRONMENT="dev"
API_LOCATION="uksouth"
SWA_LOCATION="westeurope"
SKIP_ENTRA_AUTH=false
SKIP_OIDC=false
WHAT_IF=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Output helpers ──────────────────────────────────────────────────

if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; DIM=""; RESET=""
fi

step() { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s⚠%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail() { printf '  %s✗%s %s\n' "$RED" "$RESET" "$1" >&2; }
info() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
die()  { fail "$1"; exit 1; }

usage() {
  sed -n '/^# Usage:/,/^#   -h, --help/p' "${BASH_SOURCE[0]}" | sed 's/^#[[:space:]]\{0,1\}//'
}

# ─── Argument parsing ────────────────────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)            REPO="${2:-}"; shift 2 ;;
    --subscription)    SUBSCRIPTION="${2:-}"; shift 2 ;;
    --resource-group)  RESOURCE_GROUP="${2:-}"; shift 2 ;;
    --name-prefix)     NAME_PREFIX="${2:-}"; shift 2 ;;
    --env)             ENVIRONMENT="${2:-}"; shift 2 ;;
    --api-location)    API_LOCATION="${2:-}"; shift 2 ;;
    --swa-location)    SWA_LOCATION="${2:-}"; shift 2 ;;
    --skip-entra-auth) SKIP_ENTRA_AUTH=true; shift ;;
    --skip-oidc)       SKIP_OIDC=true; shift ;;
    --what-if)         WHAT_IF=true; shift ;;
    -h|--help)         usage; exit 0 ;;
    *)                 die "Unknown option: $1 (try --help)" ;;
  esac
done

# ─── 1. Prerequisites ────────────────────────────────────────────────

step "Checking prerequisites"

command -v az >/dev/null 2>&1 || die "Azure CLI not found. Install: https://aka.ms/InstallAzureCli"
ok "az $(az version --query '"azure-cli"' -o tsv 2>/dev/null || echo '(version unknown)')"

if ! az bicep version >/dev/null 2>&1; then
  warn "Bicep CLI not installed — attempting install"
  az bicep install >/dev/null 2>&1 || die "Could not install Bicep. On a network with TLS inspection this download fails; install manually (https://aka.ms/bicep-install) or run this script elsewhere."
fi
ok "bicep present"

az account show >/dev/null 2>&1 || die "Not signed in. Run: az login"

if [ -n "$SUBSCRIPTION" ]; then
  az account set --subscription "$SUBSCRIPTION"
fi

SUB_ID="$(az account show --query id -o tsv)"
SUB_NAME="$(az account show --query name -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
USER_NAME="$(az account show --query 'user.name' -o tsv)"

step "Target"
info "Subscription   : $SUB_NAME ($SUB_ID)"
info "Tenant         : $TENANT_ID"
info "Signed in as   : $USER_NAME"
info "Resource group : $RESOURCE_GROUP"
info "API region     : $API_LOCATION"
info "Web region     : $SWA_LOCATION"
info "Name prefix    : $NAME_PREFIX-$ENVIRONMENT"

printf '\n  Deploy to this subscription? [y/N] '
read -r CONFIRM
case "$CONFIRM" in
  [Yy]*) ;;
  *) die "Aborted. Re-run with --subscription <id> to target a different subscription." ;;
esac

# ─── 2. Azure OpenAI configuration ───────────────────────────────────

step "Azure OpenAI configuration"

read_env_var() {
  [ -f "$REPO_ROOT/.env" ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$REPO_ROOT/.env" \
    | head -1 | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

AOAI_ENDPOINT="$(read_env_var AZURE_OPENAI_ENDPOINT)"
AOAI_API_VERSION="$(read_env_var OPENAI_API_VERSION)"
AOAI_DEPLOYMENT="$(read_env_var AZURE_OPENAI_DEPLOYMENT_NAME)"
AOAI_KEY="$(read_env_var AZURE_OPENAI_API_KEY)"

if [ -n "$AOAI_ENDPOINT" ]; then
  ok "Read from .env"
  info "endpoint=$AOAI_ENDPOINT  deployment=$AOAI_DEPLOYMENT  apiVersion=$AOAI_API_VERSION"
  info "api key = ${#AOAI_KEY} characters (not displayed)"
else
  warn "No .env found — enter the values manually"
fi

if [ -z "$AOAI_ENDPOINT" ]; then
  printf '  Azure OpenAI endpoint: '; read -r AOAI_ENDPOINT
fi
if [ -z "$AOAI_API_VERSION" ]; then
  printf '  Azure OpenAI API version: '; read -r AOAI_API_VERSION
fi
if [ -z "$AOAI_DEPLOYMENT" ]; then
  printf '  Azure OpenAI deployment name: '; read -r AOAI_DEPLOYMENT
fi
if [ -z "$AOAI_KEY" ]; then
  printf '  Azure OpenAI API key: '; read -rs AOAI_KEY; printf '\n'
fi

if [ -z "$AOAI_ENDPOINT" ] || [ -z "$AOAI_API_VERSION" ] || [ -z "$AOAI_DEPLOYMENT" ] || [ -z "$AOAI_KEY" ]; then
  die "All four Azure OpenAI values are required."
fi

# ─── 3. Resource group ───────────────────────────────────────────────

step "Resource group"

if az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  ok "$RESOURCE_GROUP already exists"
else
  az group create --name "$RESOURCE_GROUP" --location "$API_LOCATION" \
    --tags project=HVCTS environment="$ENVIRONMENT" -o none
  ok "Created $RESOURCE_GROUP in $API_LOCATION"
fi

RG_ID="$(az group show --name "$RESOURCE_GROUP" --query id -o tsv)"

# ─── 4. Infrastructure ───────────────────────────────────────────────

DEPLOYMENT_NAME="hvcts-$ENVIRONMENT"

set -- \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$SCRIPT_DIR/main.bicep" \
  --parameters "$SCRIPT_DIR/main.parameters.json" \
  --parameters "namePrefix=$NAME_PREFIX" \
  --parameters "env=$ENVIRONMENT" \
  --parameters "apiLocation=$API_LOCATION" \
  --parameters "swaLocation=$SWA_LOCATION" \
  --parameters "azureOpenAiEndpoint=$AOAI_ENDPOINT" \
  --parameters "azureOpenAiApiVersion=$AOAI_API_VERSION" \
  --parameters "azureOpenAiDeploymentName=$AOAI_DEPLOYMENT" \
  --parameters "azureOpenAiApiKey=$AOAI_KEY"

if [ "$WHAT_IF" = "true" ]; then
  step "Infrastructure diff (--what-if: nothing will be changed)"
  az deployment group what-if "$@"
  exit 0
fi

step "Deploying infrastructure (typically 2-4 minutes)"
az deployment group create --name "$DEPLOYMENT_NAME" "$@" -o none
ok "Deployment $DEPLOYMENT_NAME succeeded"

deployment_output() {
  az deployment group show --resource-group "$RESOURCE_GROUP" --name "$DEPLOYMENT_NAME" \
    --query "properties.outputs.$1.value" -o tsv
}

API_NAME="$(deployment_output apiName)"
API_URL="$(deployment_output apiUrl)"
SWA_NAME="$(deployment_output swaName)"
SWA_URL="$(deployment_output swaUrl)"
SWA_HOST="${SWA_URL#https://}"

ok "API : $API_URL"
ok "Web : $SWA_URL"

# Requests normally arrive same-origin via the linked backend, so this only
# matters for the cross-origin fallback — but set it correctly regardless.
az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$API_NAME" \
  --settings "ALLOWED_ORIGINS=$SWA_URL" -o none
ok "CORS allowlist set to $SWA_URL"

# ─── 5. Entra app registration for Static Web Apps sign-in ───────────

ENTRA_CLIENT_ID=""

if [ "$SKIP_ENTRA_AUTH" = "true" ]; then
  step "Entra sign-in (skipped)"
  warn "--skip-entra-auth was set. Leaving ENTRA_TENANT_ID unset deploys a PUBLIC site."
else
  step "Entra app registration for sign-in"

  AUTH_APP_NAME="$NAME_PREFIX-$ENVIRONMENT-swa-auth"
  REDIRECT_URI="https://$SWA_HOST/.auth/login/entra/callback"
  EXISTING_ID="$(az ad app list --display-name "$AUTH_APP_NAME" --query '[0].appId' -o tsv 2>/dev/null || true)"

  if [ -n "$EXISTING_ID" ] && [ "$EXISTING_ID" != "None" ]; then
    ENTRA_CLIENT_ID="$EXISTING_ID"
    ok "Reusing app registration $AUTH_APP_NAME ($ENTRA_CLIENT_ID)"
    az ad app update --id "$ENTRA_CLIENT_ID" --web-redirect-uris "$REDIRECT_URI" -o none 2>/dev/null || \
      warn "Could not update the redirect URI — check it is $REDIRECT_URI"
  else
    ENTRA_CLIENT_ID="$(az ad app create \
      --display-name "$AUTH_APP_NAME" \
      --sign-in-audience AzureADMyOrg \
      --web-redirect-uris "$REDIRECT_URI" \
      --enable-id-token-issuance true \
      --query appId -o tsv 2>/dev/null || true)"

    if [ -n "$ENTRA_CLIENT_ID" ]; then
      ok "Created app registration $AUTH_APP_NAME ($ENTRA_CLIENT_ID)"
    else
      fail "Could not create the app registration — your account likely lacks the Application Developer role."
      printf '\n%s  Ask someone with Application Developer (or higher) to create:%s\n\n' "$YELLOW" "$RESET"
      printf '    Name               : %s\n' "$AUTH_APP_NAME"
      printf '    Supported accounts : Accounts in this organizational directory only\n'
      printf '    Redirect URI (Web) : %s\n' "$REDIRECT_URI"
      printf '    ID tokens          : enabled (Authentication > Implicit grant)\n'
      printf '    Client secret      : create one and note the value\n\n'
      printf '  Then run:\n'
      printf '    az staticwebapp appsettings set --name %s \\\n' "$SWA_NAME"
      printf '      --setting-names ENTRA_CLIENT_ID=<appId> ENTRA_CLIENT_SECRET=<secret>\n\n'
      printf '  And set the GitHub repository variable ENTRA_TENANT_ID=%s\n\n' "$TENANT_ID"
    fi
  fi

  if [ -n "$ENTRA_CLIENT_ID" ]; then
    ENTRA_SECRET="$(az ad app credential reset --id "$ENTRA_CLIENT_ID" --append \
      --display-name "swa-$(date +%Y%m%d)" --years 1 --query password -o tsv)"
    az staticwebapp appsettings set --name "$SWA_NAME" \
      --setting-names "ENTRA_CLIENT_ID=$ENTRA_CLIENT_ID" "ENTRA_CLIENT_SECRET=$ENTRA_SECRET" -o none
    ok "Client id and secret stored as Static Web App application settings"
    info "The secret expires in 1 year — re-run this script to rotate it."
  fi
fi

# ─── 6. GitHub OIDC federated credential ─────────────────────────────

OIDC_CLIENT_ID=""

if [ "$SKIP_OIDC" = "true" ]; then
  step "GitHub OIDC (skipped)"
  warn "Use the publish-profile fallback in docs/DEPLOYMENT.md instead."
elif [ -z "$REPO" ]; then
  step "GitHub OIDC (skipped)"
  warn "No --repo given. Re-run with --repo <owner>/<repo> to create the federated credential."
else
  step "GitHub OIDC app registration for $REPO"

  OIDC_APP_NAME="$NAME_PREFIX-$ENVIRONMENT-github-oidc"
  EXISTING_ID="$(az ad app list --display-name "$OIDC_APP_NAME" --query '[0].appId' -o tsv 2>/dev/null || true)"

  if [ -n "$EXISTING_ID" ] && [ "$EXISTING_ID" != "None" ]; then
    OIDC_CLIENT_ID="$EXISTING_ID"
    ok "Reusing app registration $OIDC_APP_NAME ($OIDC_CLIENT_ID)"
  else
    OIDC_CLIENT_ID="$(az ad app create --display-name "$OIDC_APP_NAME" --query appId -o tsv 2>/dev/null || true)"
    if [ -n "$OIDC_CLIENT_ID" ]; then
      ok "Created app registration $OIDC_APP_NAME ($OIDC_CLIENT_ID)"
    else
      fail "Could not create the OIDC app registration (insufficient directory permissions)."
      info "Fall back to a publish profile — see docs/DEPLOYMENT.md, 'Deploying without OIDC'."
    fi
  fi

  if [ -n "$OIDC_CLIENT_ID" ]; then
    az ad sp create --id "$OIDC_CLIENT_ID" -o none 2>/dev/null || true

    for CRED in "github-main:repo:$REPO:ref:refs/heads/main" "github-production:repo:$REPO:environment:production"; do
      CRED_NAME="${CRED%%:*}"
      CRED_SUBJECT="${CRED#*:}"
      if az ad app federated-credential list --id "$OIDC_CLIENT_ID" \
           --query "[?name=='$CRED_NAME'].name" -o tsv 2>/dev/null | grep -q .; then
        ok "Federated credential '$CRED_NAME' already present"
      else
        az ad app federated-credential create --id "$OIDC_CLIENT_ID" --parameters "{
          \"name\": \"$CRED_NAME\",
          \"issuer\": \"https://token.actions.githubusercontent.com\",
          \"subject\": \"$CRED_SUBJECT\",
          \"audiences\": [\"api://AzureADTokenExchange\"]
        }" -o none
        ok "Federated credential '$CRED_NAME' -> $CRED_SUBJECT"
      fi
    done

    OIDC_SP_OBJECT_ID="$(az ad sp show --id "$OIDC_CLIENT_ID" --query id -o tsv)"
    if az role assignment list --assignee "$OIDC_SP_OBJECT_ID" --scope "$RG_ID" \
         --role Contributor --query '[0].id' -o tsv 2>/dev/null | grep -q .; then
      ok "Contributor already assigned on $RESOURCE_GROUP"
    else
      az role assignment create --assignee-object-id "$OIDC_SP_OBJECT_ID" \
        --assignee-principal-type ServicePrincipal \
        --role Contributor --scope "$RG_ID" -o none
      ok "Assigned Contributor on $RESOURCE_GROUP"
    fi
  fi
fi

# ─── 7. Static Web Apps deployment token ─────────────────────────────

step "Static Web Apps deployment token"
SWA_TOKEN="$(az staticwebapp secrets list --name "$SWA_NAME" --query 'properties.apiKey' -o tsv)"
ok "Retrieved (written to no file)"

# ─── 8. What to configure in GitHub ──────────────────────────────────

if [ -n "$ENTRA_CLIENT_ID" ]; then
  ENTRA_TENANT_VALUE="$TENANT_ID"
else
  ENTRA_TENANT_VALUE="<leave unset — deploys WITHOUT sign-in>"
fi

if [ -n "$OIDC_CLIENT_ID" ]; then
  OIDC_VALUE="$OIDC_CLIENT_ID"
else
  OIDC_VALUE="<not created — see docs/DEPLOYMENT.md for the publish-profile fallback>"
fi

printf '\n%s────────────────────────────────────────────────────────────────────%s\n' "$BOLD" "$RESET"
printf '%s Configure these in GitHub, then push to main to deploy%s\n' "$BOLD" "$RESET"
printf '%s────────────────────────────────────────────────────────────────────%s\n\n' "$BOLD" "$RESET"

printf '%sSettings > Secrets and variables > Actions > Secrets%s\n\n' "$BOLD" "$RESET"
printf '  AZURE_STATIC_WEB_APPS_API_TOKEN   %s\n' "$SWA_TOKEN"
printf '  AZURE_CLIENT_ID                   %s\n' "$OIDC_VALUE"
printf '  AZURE_TENANT_ID                   %s\n' "$TENANT_ID"
printf '  AZURE_SUBSCRIPTION_ID             %s\n\n' "$SUB_ID"

printf '%sSettings > Secrets and variables > Actions > Variables%s\n\n' "$BOLD" "$RESET"
printf '  AZURE_WEBAPP_NAME                 %s\n' "$API_NAME"
printf '  AZURE_RESOURCE_GROUP              %s\n' "$RESOURCE_GROUP"
printf '  ENTRA_TENANT_ID                   %s\n\n' "$ENTRA_TENANT_VALUE"

printf '%sDeployed URLs%s\n\n' "$BOLD" "$RESET"
printf '  Web (use this)   %s\n' "$SWA_URL"
printf '  API (direct)     %s\n' "$API_URL"
printf '  API health       %s/api/ai/health\n\n' "$API_URL"

if [ -z "$ENTRA_CLIENT_ID" ]; then
  warn "Entra sign-in is NOT configured. A deployment with ENTRA_TENANT_ID unset is PUBLIC and its AI endpoints can be called by anyone."
fi

if command -v gh >/dev/null 2>&1 && [ -n "$REPO" ]; then
  printf '\n  GitHub CLI detected. Set all of the above on %s automatically? [y/N] ' "$REPO"
  read -r SET_GH
  case "$SET_GH" in
    [Yy]*)
      gh secret   set AZURE_STATIC_WEB_APPS_API_TOKEN --repo "$REPO" --body "$SWA_TOKEN"
      gh secret   set AZURE_TENANT_ID                --repo "$REPO" --body "$TENANT_ID"
      gh secret   set AZURE_SUBSCRIPTION_ID          --repo "$REPO" --body "$SUB_ID"
      gh variable set AZURE_WEBAPP_NAME              --repo "$REPO" --body "$API_NAME"
      gh variable set AZURE_RESOURCE_GROUP           --repo "$REPO" --body "$RESOURCE_GROUP"
      if [ -n "$OIDC_CLIENT_ID" ]; then
        gh secret set AZURE_CLIENT_ID --repo "$REPO" --body "$OIDC_CLIENT_ID"
      fi
      if [ -n "$ENTRA_CLIENT_ID" ]; then
        gh variable set ENTRA_TENANT_ID --repo "$REPO" --body "$TENANT_ID"
      fi
      ok "GitHub secrets and variables configured"
      ;;
  esac
fi

step "Done"
