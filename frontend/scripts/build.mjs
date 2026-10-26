// Production build. Vite reads frontend/.env in every mode, and that file holds the local
// development address. Variables that already exist when Vite starts win over .env files, so
// this sets VITE_API_BASE_URL to an empty string. src/config.ts treats empty as "not set" and
// uses its default, the public API. One .env stays for local development, and a build can
// never pick it up.

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')

const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_BASE_URL: '' },
})
process.exit(result.status ?? 1)
