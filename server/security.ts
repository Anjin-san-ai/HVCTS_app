/**
 * Security middleware for public hosting.
 *
 * Locally (no env vars set) everything here is permissive, so `npm run dev`
 * behaves exactly as before. In Azure the App Service application settings
 * turn each control on.
 */

import type { CorsOptions } from 'cors';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// ─── CORS ────────────────────────────────────────────────────────────
//
// The API is normally reached through the Static Web App's linked backend,
// which is same-origin, so no CORS header is needed at all. The allowlist
// exists for the "SWA Free tier" fallback where the SPA calls the App
// Service directly, cross-origin.

/** Comma-separated list of permitted browser origins. Unset = allow all. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No allowlist configured (local dev), or a non-browser caller with no
    // Origin header (curl, health probes) — permit.
    if (ALLOWED_ORIGINS.length === 0 || !origin) {
      callback(null, true);
      return;
    }
    callback(null, ALLOWED_ORIGINS.includes(origin));
  },
  credentials: true,
};

// ─── Static Web Apps client principal ────────────────────────────────

export interface SwaPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/**
 * Decode the `x-ms-client-principal` header that Static Web Apps injects on
 * every linked-backend request once the user has signed in with Entra ID.
 * Returns null if the header is absent or malformed.
 */
export function decodeSwaPrincipal(req: Request): SwaPrincipal | null {
  const header = req.get('x-ms-client-principal');
  if (!header) return null;

  try {
    const parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Partial<SwaPrincipal>;
    if (!parsed || typeof parsed.userId !== 'string' || !parsed.userId) return null;
    return {
      identityProvider: parsed.identityProvider || 'unknown',
      userId: parsed.userId,
      userDetails: parsed.userDetails || '',
      userRoles: Array.isArray(parsed.userRoles) ? parsed.userRoles : [],
    };
  } catch {
    return null;
  }
}

const REQUIRE_SWA_AUTH = process.env.REQUIRE_SWA_AUTH === 'true';

/**
 * The real boundary against bypassing the SPA and calling
 * `https://<api>.azurewebsites.net/api/ai/*` directly is Azure itself:
 * deploying a `staticSites/linkedBackends` resource automatically enables
 * App Service platform authentication (the `azureStaticWebApps` identity
 * provider, scoped to that one Static Web App) — confirmed by testing,
 * that 401s before this code ever runs. See docs/DEPLOYMENT.md.
 *
 * This middleware is a secondary, app-layer check, and can only reject —
 * never require — based on `x-ms-client-principal`, because that header's
 * presence differs by deployment mode, confirmed by testing against the
 * live site:
 *   - Entra sign-in OFF (the "public" fallback in docs/DEPLOYMENT.md —
 *     see scripts/prepare-swa-config.mjs): Static Web Apps does not attach
 *     the header at all. Blocking on its absence would lock out that
 *     entire mode, which is public by design.
 *   - Entra sign-in ON: staticwebapp.config.json's `allowedRoles` already
 *     redirects unauthenticated visitors to sign in at the Static Web
 *     Apps edge, before the request is ever proxied here — so a request
 *     that reaches this point and DOES carry a principal is expected to
 *     have the `authenticated` role. Reject only that specific
 *     contradiction (principal present, role missing), since it implies
 *     something bypassed the edge gate while still passing Azure's own
 *     linked-backend check above.
 */
export const requireSwaPrincipal: RequestHandler = (req, res, next) => {
  const principal = decodeSwaPrincipal(req);

  if (principal) {
    res.locals.swaPrincipal = principal;
  }

  if (!REQUIRE_SWA_AUTH) {
    next();
    return;
  }

  if (principal && !principal.userRoles.includes('authenticated')) {
    res.status(401).json({
      success: false,
      error: 'Unauthorised',
      message: 'This endpoint must be called through an authenticated session.',
    });
    return;
  }

  next();
};

// ─── Rate limiting ───────────────────────────────────────────────────
//
// Fixed-window counter, in-process. Adequate for a single-instance
// prototype; if the App Service is ever scaled out, each instance keeps its
// own counters and the effective limit multiplies by the instance count.
// Move to Redis at that point.

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Absolute ceiling on AI requests per window across all callers.
 *
 * The per-caller limit is only as good as our ability to identify a caller.
 * Behind a Static Web Apps linked backend the client address is not reliably
 * visible, so a single client can land in several buckets and receive a
 * multiple of the per-caller budget. This ceiling is what actually bounds
 * Azure OpenAI spend on a public deployment, and it needs no client identity
 * at all. Defaults to 4x the per-caller limit so ordinary use is unaffected.
 */
function globalCeiling(max: number): number {
  const configured = parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : max * 4;
}

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function rateLimit({ windowMs = 5 * 60_000, max = 30 }: RateLimitOptions = {}): RequestHandler {
  const windows = new Map<string, Window>();
  const ceiling = globalCeiling(max);
  let global: Window = { count: 0, resetAt: Date.now() + windowMs };

  // Identify the caller as specifically as the deployment allows.
  //
  // `req.ip` is not usable here: behind a Static Web App's linked backend the
  // request passes through an SWA edge node before reaching the App Service,
  // so with `trust proxy` set to a fixed hop count Express resolves to the
  // SWA edge address rather than the original client.
  //
  // Confirmed from the App Service logs for this deployment shape: SWA does
  // not set `x-azure-clientip`, but does set `x-forwarded-for` to
  // "client, swa-edge, app-service-frontend" — three entries, client first.
  // The leftmost entry is technically client-supplied and therefore
  // spoofable, but the alternative, trusting nothing, is to fall back to
  // the useless `req.ip`. `x-azure-clientip` is still checked first in case
  // a future platform hop sets it, since it is edge-set and not spoofable.
  function keyFor(req: Request, res: Response): string {
    const principal = res.locals.swaPrincipal as SwaPrincipal | undefined;
    if (principal?.userId) return principal.userId;

    const azureClientIp = req.get('x-azure-clientip');
    if (azureClientIp) return azureClientIp.trim();

    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      // Strip any :port suffix Azure appends, but leave IPv6 addresses alone.
      const first = forwarded.split(',')[0].trim();
      return first.includes(':') && first.split(':').length === 2 ? first.split(':')[0] : first;
    }

    return req.ip || 'unknown';
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();

    // Opportunistic cleanup so the map cannot grow without bound.
    if (windows.size > 5_000) {
      for (const [key, window] of windows) {
        if (window.resetAt <= now) windows.delete(key);
      }
    }

    // Process-wide ceiling first: it is the guarantee that does not depend on
    // recognising the caller.
    if (global.resetAt <= now) global = { count: 0, resetAt: now + windowMs };
    global.count += 1;
    if (global.count > ceiling) {
      const retryAfter = Math.ceil((global.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: 'Service busy',
        message: `The AI service is at capacity (${ceiling} requests per ${Math.round(windowMs / 60_000)} minutes across all users). Try again shortly.`,
      });
      return;
    }

    const key = keyFor(req, res);
    let window = windows.get(key);

    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }

    window.count += 1;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - window.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((window.resetAt - now) / 1000)));

    if (window.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((window.resetAt - now) / 1000)));
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: `Limit is ${max} AI requests per ${Math.round(windowMs / 60_000)} minutes.`,
      });
      return;
    }

    next();
  };
}
