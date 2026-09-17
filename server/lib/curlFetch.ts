import { execSync } from 'node:child_process';

export function curlFetch(
  url: string,
  opts?: { method?: string; body?: string; headers?: Record<string, string>; timeoutSec?: number; basicAuth?: string },
): { status: number; body: string } {
  const args = ['-skL', '--max-time', String(opts?.timeoutSec || 15)];
  if (opts?.method === 'POST') args.push('-X', 'POST');
  if (opts?.body) args.push('-d', opts.body);
  if (opts?.basicAuth) args.push('-u', opts.basicAuth);
  if (opts?.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      args.push('-H', `${k}: ${v}`);
    }
  }
  args.push('-w', '\\n%{http_code}');
  args.push(url);

  try {
    const raw = execSync(`curl ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: (opts?.timeoutSec || 15) * 1000 + 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = raw.trimEnd().split('\n');
    const statusLine = lines.pop() || '0';
    const body = lines.join('\n');
    return { status: parseInt(statusLine, 10) || 0, body };
  } catch (err) {
    throw new Error(`curl failed: ${(err as Error).message?.substring(0, 100)}`);
  }
}
