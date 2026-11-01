import { DatabaseSchema } from './types';

/**
 * Base path for assets and static files (empty locally, /keuangan.github.io on Pages).
 * Next.js Link components get basePath automatically; fetch() does not.
 */
export function getBasePath(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_PATH) {
    return process.env.NEXT_PUBLIC_BASE_PATH;
  }
  return '';
}

/**
 * Load database for the client UI.
 * 1) Prefer /api/data when a Node server is available (local next dev / Vercel).
 * 2) Fall back to static public/data/db.json (GitHub Pages static export).
 * Appearance of pages is unchanged either way.
 */
export async function loadDatabase(): Promise<DatabaseSchema | null> {
  const base = getBasePath();

  try {
    const apiRes = await fetch(`${base}/api/data`);
    if (apiRes.ok) {
      return (await apiRes.json()) as DatabaseSchema;
    }
  } catch {
    // API not available on static host — fall through
  }

  try {
    const staticRes = await fetch(`${base}/data/db.json`);
    if (staticRes.ok) {
      return (await staticRes.json()) as DatabaseSchema;
    }
  } catch {
    // ignore
  }

  return null;
}

/** Prefix an absolute app path for fetch when basePath is set. */
export function apiUrl(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
