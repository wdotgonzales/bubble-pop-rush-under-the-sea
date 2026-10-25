// Small helpers shared by the tests.

export type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

export interface RecordedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** A fetch that answers from `handler` and remembers what it was asked. */
export function fakeFetch(handler: Handler): { fetchFn: typeof fetch; calls: RecordedRequest[] } {
  const calls: RecordedRequest[] = []
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return handler(url, init)
  }) as typeof fetch
  return { fetchFn, calls }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/** The error a promise rejects with. Fails the test if it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject, but it resolved')
}
