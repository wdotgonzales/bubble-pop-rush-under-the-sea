// Where the backend lives. It is read from VITE_API_BASE_URL and nowhere else:
//   frontend/.env              local development (npm run dev), for example http://localhost:8000
//   frontend/.env.production   builds (npm run build / pack); Vite uses it instead of .env then
//   the build environment      Docker and CI pass it in as a build argument
// There is no default. A build without an address stops (scripts/build.mjs), and a running game
// without one says so (see createServices), rather than quietly talking to the wrong backend.
import { normalizeApiBaseUrl } from './api/baseUrl'

export const API_BASE_URL: string = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
