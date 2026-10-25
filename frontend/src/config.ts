// Where the backend lives. Set VITE_API_BASE_URL in frontend/.env for local
// development (for example http://localhost:8000). The default is the public
// backend, so a plain production build, including the one uploaded to Facebook,
// needs no configuration.
const DEFAULT_API_BASE_URL = 'https://bubble-pop-rush.xyz/api'

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, '')
