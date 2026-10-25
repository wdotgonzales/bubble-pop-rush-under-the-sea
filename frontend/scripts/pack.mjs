// Zips the production build for upload to Facebook (Instant Games > Web Hosting).
//
//   npm run pack        builds, then writes frontend/fb-build.zip
//
// Facebook needs index.html and fbapp-config.json at the ROOT of the zip, not inside a
// folder, so this zips the contents of dist/. It writes the zip format by hand with
// Node's built-in zlib, so there is nothing extra to install.

import { deflateRawSync } from 'node:zlib'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const out = join(root, 'fb-build.zip')

for (const required of ['index.html', 'fbapp-config.json']) {
  if (!existsSync(join(dist, required))) {
    console.error(`dist/${required} is missing. Run "npm run build" first.`)
    process.exit(1)
  }
}

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// A fixed timestamp keeps the zip identical for identical input.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

const names = walk(dist).map((file) => relative(dist, file).split(sep).join('/'))
// index.html first, so it is easy to spot at the top of the archive.
names.sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))

const chunks = []
const central = []
let offset = 0
let rawTotal = 0

for (const name of names) {
  const data = readFileSync(join(dist, ...name.split('/')))
  const packed = deflateRawSync(data, { level: 9 })
  const nameBytes = Buffer.from(name, 'utf8')
  const crc = crc32(data)
  rawTotal += data.length

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0x0800, 6) // UTF-8 names
  local.writeUInt16LE(8, 8) // deflate
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(packed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  local.writeUInt16LE(0, 28)
  chunks.push(local, nameBytes, packed)

  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0)
  entry.writeUInt16LE(20, 4) // version made by
  entry.writeUInt16LE(20, 6) // version needed
  entry.writeUInt16LE(0x0800, 8)
  entry.writeUInt16LE(8, 10)
  entry.writeUInt16LE(DOS_TIME, 12)
  entry.writeUInt16LE(DOS_DATE, 14)
  entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(packed.length, 20)
  entry.writeUInt32LE(data.length, 24)
  entry.writeUInt16LE(nameBytes.length, 28)
  entry.writeUInt32LE(offset, 42)
  central.push(entry, nameBytes)

  offset += local.length + nameBytes.length + packed.length
}

const centralSize = central.reduce((sum, part) => sum + part.length, 0)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(names.length, 8)
end.writeUInt16LE(names.length, 10)
end.writeUInt32LE(centralSize, 12)
end.writeUInt32LE(offset, 16)

writeFileSync(out, Buffer.concat([...chunks, ...central, end]))

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
console.log(`Wrote ${relative(process.cwd(), out) || out}: ${names.length} files, ${kb(rawTotal)} uncompressed.`)
if (rawTotal > 5 * 1024 * 1024) {
  console.warn('Warning: Facebook recommends keeping the initial load under about 5 MB.')
}
