// HVCTS prototype — Azure infrastructure
//
// Frontend: Azure Static Web Apps (Standard) serving the built Vite SPA.
// Backend:  Azure App Service (Linux, Node 22) running the compiled Express
//           API, attached to the Static Web App as a linked backend so the
//           SPA reaches it same-origin at /api/*.
//
// Deploy with infra/setup-azure.sh, which supplies the @secure() parameters.

targetScope = 'resourceGroup'

@description('Short name prefix for all resources.')
@minLength(3)
@maxLength(10)
param namePrefix string = 'hvcts'

@description('Environment discriminator, e.g. dev / test / demo.')
@allowed(['dev', 'test', 'demo', 'prod'])
param env string = 'dev'

@description('Region for the App Service and Application Insights. UK South honours the UK-sovereignty constraint in solution-architecture.md.')
param apiLocation string = 'uksouth'

@description('Region for the Static Web App. Static Web Apps is not available in uksouth; content is served from the global edge regardless.')
@allowed(['westeurope', 'northeurope', 'eastus2', 'centralus', 'westus2', 'eastasia'])
param swaLocation string = 'westeurope'

@description('App Service plan SKU. B1 is the cheapest tier that supports Always On.')
param appServicePlanSku string = 'B1'

// ─── Azure OpenAI wiring ─────────────────────────────────────────────

@description('Azure OpenAI endpoint, e.g. https://my-aoai.openai.azure.com/')
param azureOpenAiEndpoint string

@description('Azure OpenAI API version, e.g. 2025-01-01-preview')
param azureOpenAiApiVersion string

@description('Azure OpenAI chat deployment name, e.g. gpt-5.5')
param azureOpenAiDeploymentName string

@description('Azure OpenAI API key. Never commit this — setup-azure.sh passes it at deploy time.')
@secure()
param azureOpenAiApiKey string

@description('Set true only for deployments that accept a non-default temperature (gpt-4o and earlier). Reasoning models reject it.')
param azureOpenAiSupportsTemperature bool = false

// ─── Naming ──────────────────────────────────────────────────────────

var suffix = uniqueString(resourceGroup().id)
var planName = '${namePrefix}-${env}-plan'
var apiName = '${namePrefix}-${env}-api-${suffix}'
var swaName = '${namePrefix}-${env}-web'
var insightsName = '${namePrefix}-${env}-insights'
var workspaceName = '${namePrefix}-${env}-logs'

var tags = {
  project: 'HVCTS'
  environment: env
  classification: 'OFFICIAL-SENSITIVE'
  managedBy: 'infra/main.bicep'
}

// ─── Observability ───────────────────────────────────────────────────

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: apiLocation
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: apiLocation
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    // The audit/PII rules in technical-design-spec.md §6 forbid raw PII in
    // telemetry. Keep IP masking on.
    DisableIpMasking: false
  }
}

// ─── API: App Service ────────────────────────────────────────────────

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: apiLocation
  tags: tags
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true // required for Linux
  }
}

resource api 'Microsoft.Web/sites@2023-12-01' = {
  name: apiName
  location: apiLocation
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      healthCheckPath: '/api/ai/health'
      // The deployment zip contains dist-server/ and production
      // node_modules; there is nothing to build on the server.
      appCommandLine: 'node dist-server/index.js'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        // The zip already contains production node_modules, so Oryx must not
        // try to build on the server. WEBSITE_RUN_FROM_PACKAGE is deliberately
        // NOT set: on Linux the plain zip-extract path is the reliable one.
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
        { name: 'OPENAI_API_VERSION', value: azureOpenAiApiVersion }
        { name: 'AZURE_OPENAI_DEPLOYMENT_NAME', value: azureOpenAiDeploymentName }
        { name: 'AZURE_OPENAI_API_KEY', value: azureOpenAiApiKey }
        { name: 'AZURE_OPENAI_SUPPORTS_TEMPERATURE', value: string(azureOpenAiSupportsTemperature) }
        // Reject any request that did not arrive via an authenticated
        // Static Web Apps session — see server/security.ts.
        { name: 'REQUIRE_SWA_AUTH', value: 'true' }
        { name: 'RATE_LIMIT_WINDOW_MS', value: '300000' }
        { name: 'RATE_LIMIT_MAX', value: '30' }
        // Same-origin via the linked backend, so no browser origin needs
        // allowing. Populated only for the cross-origin fallback.
        { name: 'ALLOWED_ORIGINS', value: '' }
      ]
    }
  }
}

// ─── Frontend: Static Web App ────────────────────────────────────────
//
// Standard SKU is required for linked backends (Free supports only
// SWA-managed Azure Functions) and for custom OpenID Connect providers,
// which is how Entra ID sign-in is configured.

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: swaLocation
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    // GitHub Actions deploys with the API token; no repository binding, so
    // Azure does not generate its own competing workflow file.
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: swa
  name: 'api'
  properties: {
    backendResourceId: api.id
    region: apiLocation
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────

output apiName string = api.name
output apiUrl string = 'https://${api.properties.defaultHostName}'
output apiHealthUrl string = 'https://${api.properties.defaultHostName}/api/ai/health'
output swaName string = swa.name
output swaUrl string = 'https://${swa.properties.defaultHostname}'
output resourceGroupName string = resourceGroup().name
output linkedBackendName string = linkedBackend.name
