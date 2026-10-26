/**
 * The backend address as it was typed in the env file: surrounding spaces and trailing slashes
 * removed, and "" when it is not set. There is no built-in address on purpose: where the backend
 * lives is configuration (frontend/.env, frontend/.env.production, or the build environment),
 * never code.
 */
export function normalizeApiBaseUrl(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

/** What to tell whoever runs the game or the build without an address. */
export const MISSING_API_URL_MESSAGE =
  'VITE_API_BASE_URL is not set. Copy frontend/.env.example to frontend/.env (local development) ' +
  'or frontend/.env.production (builds).'
