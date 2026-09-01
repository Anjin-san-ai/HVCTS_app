#!/usr/bin/env node
/**
 * Post-deploy smoke test: polls the API health endpoint until it reports
 * ready, or fails the workflow after a timeout.
 *
 * Usage: node scripts/smoke.mjs <health-url> [timeoutSeconds]
 */

const [, , url, timeoutArg] = process.argv;

if (!url) {
  console.error('Usage: node scripts/smoke.mjs <health-url> [timeoutSeconds]');
  process.exit(1);
}

const timeoutMs = (Number(timeoutArg) || 120) * 1000;
const pollIntervalMs = 5000;
const deadline = Date.now() + timeoutMs;

async function poll() {
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const body = await res.json();

      if (res.ok && body.status === 'ok') {
        console.log(`✓ ${url} is healthy`);
        console.log(`  configured: ${body.configured}`);
        if (!body.configured) {
          console.error('✗ API is reachable but Azure OpenAI is not configured (check app settings).');
          process.exit(1);
        }
        return;
      }

      lastError = `HTTP ${res.status}: ${JSON.stringify(body)}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    console.log(`  waiting... (${lastError})`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.error(`✗ ${url} did not become healthy within ${timeoutMs / 1000}s. Last error: ${lastError}`);
  process.exit(1);
}

await poll();
