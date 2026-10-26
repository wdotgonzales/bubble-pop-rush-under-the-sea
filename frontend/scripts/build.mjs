// Production build. The backend address comes from the environment and is never written in code:
// Vite reads frontend/.env.production for a build (and frontend/.env for local development, which
// a production build does not use when .env.production exists), and a variable already set in the
// environment (Docker and CI pass it in) wins over both files.
//
// This script only stops the build early, with a plain message, when there is no address, instead
// of producing a game that cannot reach its backend.

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')

const address = (loadEnv('production', root, 'VITE_').VITE_API_BASE_URL ?? '').trim()
if (!address) {
  console.error(
    [
      'VITE_API_BASE_URL is not set, so this build would not know where the backend is.',
      'Put it in frontend/.env.production (see frontend/.env.example), or pass it as an environment',
      'variable or a Docker build argument.',
    ].join('\n'),
  )
  process.exit(1)
}

const result = spawnSync(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit', env: process.env })
process.exit(result.status ?? 1)
