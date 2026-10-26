import { describe, expect, it } from 'vitest'
import { MISSING_API_URL_MESSAGE, normalizeApiBaseUrl } from '../src/api/baseUrl'

describe('normalizeApiBaseUrl', () => {
  it('is empty when the address is not set, so there is no hidden default', () => {
    expect(normalizeApiBaseUrl(undefined)).toBe('')
    expect(normalizeApiBaseUrl('')).toBe('')
    expect(normalizeApiBaseUrl('   ')).toBe('')
  })

  it('keeps the address as written', () => {
    expect(normalizeApiBaseUrl('http://localhost:8000')).toBe('http://localhost:8000')
    expect(normalizeApiBaseUrl('https://example.com/api')).toBe('https://example.com/api')
  })

  it('drops spaces and trailing slashes so paths join cleanly', () => {
    expect(normalizeApiBaseUrl('  https://example.com/api/  ')).toBe('https://example.com/api')
    expect(normalizeApiBaseUrl('https://example.com/api///')).toBe('https://example.com/api')
  })
})

describe('missing address message', () => {
  it('says which variable and which files', () => {
    expect(MISSING_API_URL_MESSAGE).toContain('VITE_API_BASE_URL')
    expect(MISSING_API_URL_MESSAGE).toContain('.env.production')
  })
})
