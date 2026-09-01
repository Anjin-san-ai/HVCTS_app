#!/usr/bin/env node
/**
 * Finalise dist/staticwebapp.config.json after `vite build`.
 *
 * The committed template in public/ assumes Entra ID sign-in. The tenant id
 * cannot be supplied via a Static Web Apps app setting (only the client id
 * and secret can), so it is substituted here from the ENTRA_TENANT_ID
 * environment variable.
 *
 *   ENTRA_TENANT_ID set    → authenticated deployment (the intended mode)
 *   ENTRA_TENANT_ID unset  → auth block and role restrictions are stripped,
 *                            producing a PUBLIC site. This exists so the app
 *                            can still be deployed before an Entra app
 *                            registration is available.
 *
 * Run: node scripts/prepare-swa-config.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG_PATH = 'dist/staticwebapp.config.json';
const PLACEHOLDER = '__ENTRA_TENANT_ID__';

if (!existsSync(CONFIG_PATH)) {
  console.error(`✗ ${CONFIG_PATH} not found. Run \`npm run build\` first.`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const tenantId = (process.env.ENTRA_TENANT_ID || '').trim();

if (tenantId) {
  const provider = config.auth?.identityProviders?.customOpenIdConnectProviders?.entra;
  const oidc = provider?.registration?.openIdConnectConfiguration;

  if (!oidc?.wellKnownOpenIdConfiguration?.includes(PLACEHOLDER)) {
    console.error(`✗ ${PLACEHOLDER} not found in the config template — cannot configure Entra sign-in.`);
    process.exit(1);
  }

  oidc.wellKnownOpenIdConfiguration = oidc.wellKnownOpenIdConfiguration.replace(PLACEHOLDER, tenantId);
  console.log(`✓ Entra sign-in configured for tenant ${tenantId}`);
  console.log('  The Static Web App must also have ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET app settings.');
} else {
  delete config.auth;
  delete config.responseOverrides?.['401'];
  if (Object.keys(config.responseOverrides ?? {}).length === 0) delete config.responseOverrides;

  // Drop routes that exist purely as auth gates ({ route, allowedRoles });
  // keep ones that also do something else (redirects, status overrides).
  config.routes = (config.routes ?? [])
    .filter((route) => !(route.allowedRoles && Object.keys(route).length === 2))
    .map(({ allowedRoles: _allowedRoles, ...rest }) => rest);

  console.warn('⚠ ENTRA_TENANT_ID is not set — auth has been stripped.');
  console.warn('⚠ This deployment will be PUBLICLY ACCESSIBLE, including the AI endpoints.');
  console.warn('⚠ Set the ENTRA_TENANT_ID repository variable to enable Entra ID sign-in.');
}

writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

const written = readFileSync(CONFIG_PATH, 'utf8');
if (written.includes(PLACEHOLDER)) {
  console.error(`✗ ${PLACEHOLDER} survived into the built config. Refusing to deploy.`);
  process.exit(1);
}
