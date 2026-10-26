import { describe, expect, it } from 'vitest'
import { createArtCache, withImageType } from '../src/ui/artCache'

function setup(files: Record<string, { body: string; type?: string; status?: number }>) {
  const fetched: string[] = []
  const made: Blob[] = []
  const cache = createArtCache({
    fetchFn: async (url) => {
      fetched.push(url)
      const file = files[url]
      if (!file) throw new TypeError('Failed to fetch')
      return new Response(file.body, { status: file.status ?? 200, headers: { 'Content-Type': file.type ?? 'image/svg+xml' } })
    },
    makeUrl: (blob) => {
      made.push(blob)
      return `blob:kept/${made.length}`
    },
  })
  return { cache, fetched, made }
}

describe('createArtCache', () => {
  it('gives the original address until a picture has been kept', () => {
    const { cache } = setup({})
    expect(cache.resolve('/a.svg')).toBe('/a.svg')
  })

  it('keeps a picture and then gives the in-memory address', async () => {
    const { cache } = setup({ '/a.svg': { body: '<svg/>' } })
    await cache.keep('/a.svg')
    expect(cache.resolve('/a.svg')).toBe('blob:kept/1')
  })

  it('downloads a picture only once, even when asked twice at the same time', async () => {
    const { cache, fetched } = setup({ '/a.svg': { body: '<svg/>' } })
    await Promise.all([cache.keep('/a.svg'), cache.keep('/a.svg')])
    await cache.keep('/a.svg')
    expect(fetched).toEqual(['/a.svg'])
  })

  it('keeps each picture separately', async () => {
    const { cache } = setup({ '/a.svg': { body: 'a' }, '/b.jpg': { body: 'b', type: 'image/jpeg' } })
    await Promise.all([cache.keep('/a.svg'), cache.keep('/b.jpg')])
    expect(cache.resolve('/a.svg')).not.toBe(cache.resolve('/b.jpg'))
  })

  it('does not fail, and keeps the original address, when the download fails', async () => {
    const { cache } = setup({})
    await cache.keep('/missing.svg')
    expect(cache.resolve('/missing.svg')).toBe('/missing.svg')
  })

  it('ignores an error response instead of keeping it as a picture', async () => {
    const { cache } = setup({ '/a.svg': { body: 'nope', status: 404 } })
    await cache.keep('/a.svg')
    expect(cache.resolve('/a.svg')).toBe('/a.svg')
  })

  it('tries again later after a failure', async () => {
    const files: Record<string, { body: string }> = {}
    const { cache } = setup(files)
    await cache.keep('/a.svg')
    files['/a.svg'] = { body: '<svg/>' }
    await cache.keep('/a.svg')
    expect(cache.resolve('/a.svg')).toBe('blob:kept/1')
  })
})

describe('withImageType', () => {
  it('leaves a picture that already has an image type alone', () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    expect(withImageType(blob, '/a.png')).toBe(blob)
  })

  it('gives an untyped picture its type from the file extension', () => {
    expect(withImageType(new Blob(['x'], { type: 'text/plain' }), '/assets/turtle.svg?v=3').type).toBe('image/svg+xml')
    expect(withImageType(new Blob(['x']), '/x/bg.jpg').type).toBe('image/jpeg')
    expect(withImageType(new Blob(['x']), '/x/shell.webp#hash').type).toBe('image/webp')
  })

  it('keeps an unknown extension as it is', () => {
    const blob = new Blob(['x'], { type: 'text/plain' })
    expect(withImageType(blob, '/x/file.bin')).toBe(blob)
  })
})
