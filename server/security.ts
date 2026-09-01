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
 * Reject requests that did not arrive via an authenticated Static Web Apps
 * session. This is what stops someone bypassing the SPA's sign-in gate by
 * calling `https://<api>.azurewebsites.net/api/ai/*` directly.
 *
 * The App Service hostname stays publicly resolvable, so this is an
 * application-layer control, not a network one — see docs/DEPLOYMENT.md for
 * the optional access-restriction hardening.
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

  if (!principal || !principal.userRoles.includes('authenticated')) {
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

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export function rateLimit({ windowMs = 5 * 60_000, max = 30 }: RateLimitOptions = {}): RequestHandler {
  const windows = new Map<string, Window>();

  function keyFor(req: Request, res: Response): string {
    const principal = res.locals.swaPrincipal as SwaPrincipal | undefined;
    return principal?.userId || req.ip || 'unknown';
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();

    // Opportunistic cleanup so the map cannot grow without bound.
    if (windows.size > 5_000) {
      for (const [key, window] of windows) {
        if (window.resetAt <= now) windows.delete(key);
      }
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
