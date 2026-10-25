// A small fetch wrapper for the backend. It adds the bearer token, a timeout, and
// turns failures into two error types the rest of the game can reason about.

/** The server answered with an error status. */
export class ApiError extends Error {
  readonly status: number
  /** The machine-readable reason when the server gave one, e.g. "too_early". */
  readonly code: string | null
  readonly retryAfterSeconds: number | null

  constructor(status: number, code: string | null, message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** No usable answer: offline, DNS, CORS, or a timeout. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

/**
 * Is it worth sending the same request again later? The submit route's contract:
 * a 4xx means the round is finished for good (drop it); only network errors,
 * 429 and 5xx are worth retrying.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500
  return false
}

export interface RequestOptions {
  body?: unknown
  /** Send the session token. Default true. */
  auth?: boolean
}

export interface ApiClient {
  request<T>(method: 'GET' | 'POST', path: string, options?: RequestOptions): Promise<T>
}

export interface ClientOptions {
  baseUrl: string
  /** Returns a valid session token, signing in first if needed. */
  getToken: () => Promise<string | null>
  /** Called when the server rejects the token, before one retry. */
  invalidateToken?: () => void
  fetchFn?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

export function createApiClient(options: ClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const doFetch: typeof fetch = options.fetchFn ?? ((input, init) => fetch(input, init))

  async function send(method: string, path: string, body: unknown, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) throw new NetworkError(`The request timed out after ${timeoutMs} ms.`)
      throw new NetworkError(error instanceof Error ? error.message : 'The network request failed.')
    } finally {
      clearTimeout(timer)
    }
  }

  async function toError(response: Response): Promise<ApiError> {
    let detail: unknown = null
    try {
      const parsed: unknown = await response.json()
      if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
        detail = (parsed as { detail: unknown }).detail
      }
    } catch {
      // Not JSON (a proxy error page, say). The status alone will do.
    }
    let code: string | null = null
    if (detail && typeof detail === 'object' && !Array.isArray(detail) && 'code' in detail) {
      code = String((detail as { code: unknown }).code)
    }
    const message = typeof detail === 'string' ? detail : (code ?? `HTTP ${response.status}`)
    const retryAfter = Number(response.headers.get('Retry-After'))
    return new ApiError(response.status, code, message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null)
  }

  return {
    async request<T>(method: 'GET' | 'POST', path: string, requestOptions: RequestOptions = {}): Promise<T> {
      const { body, auth = true } = requestOptions
      let token = auth ? await options.getToken() : null
      let response = await send(method, path, body, token)

      if (response.status === 401 && auth) {
        // The token may have expired or been revoked: sign in again and retry once.
        options.invalidateToken?.()
        token = await options.getToken()
        response = await send(method, path, body, token)
      }

      if (!response.ok) throw await toError(response)
      return (await response.json()) as T
    },
  }
}
