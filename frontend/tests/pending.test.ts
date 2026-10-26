import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../src/api/client'
import {
  MAX_PENDING,
  ScoreQueue,
  expiryOf,
  parsePending,
  type PendingScore,
  type PendingStore,
  type ScoreOutcome,
} from '../src/game/pending'
import type { SubmitResult } from '../src/types'

const NOW = 1_000_000

function score(id: string, overrides: Partial<PendingScore> = {}): PendingScore {
  return { roundId: id, taps: [{ t: 100, x: 500, y: 900 }], durationMs: 30000, expiresAt: NOW + 60_000, ...overrides }
}

function accepted(id: string, points = 5): SubmitResult {
  return { round_id: id, status: 'accepted', score: points, best_score: points, is_new_best: true, rank: 1 }
}

/** A store that keeps what it is given, and remembers every write. */
function memoryStore(initial: unknown = []): PendingStore & { saved: PendingScore[][]; data: unknown } {
  const store = {
    saved: [] as PendingScore[][],
    data: initial,
    load: async () => store.data,
    save: async (list: PendingScore[]) => {
      store.saved.push(list.map((item) => ({ ...item })))
      store.data = list
    },
  }
  return store
}

/** Lets pending promise callbacks (the queue's chained writes) run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const instant = { delays: [0, 0], sleep: async () => undefined }

function setup(send: (s: PendingScore) => Promise<SubmitResult>, store: PendingStore = memoryStore()) {
  const outcomes: Array<[string, ScoreOutcome]> = []
  const queue = new ScoreQueue({ send, store, now: () => NOW, retry: instant })
  queue.subscribe((id, outcome) => outcomes.push([id, outcome]))
  return { queue, outcomes, store }
}

describe('parsePending', () => {
  it('reads a complete score', () => {
    expect(parsePending([score('a')], NOW)).toEqual([score('a')])
  })

  it('skips anything that is not a complete, unexpired score', () => {
    const bad: unknown[] = [
      null,
      'text',
      { roundId: 'x' },
      score('no-id', { roundId: '' }),
      { ...score('t'), taps: 'nope' },
      { ...score('t2'), taps: [{ t: 1.5, x: 1, y: 1 }] },
      { ...score('t3'), taps: [{ t: 1, x: 'a', y: 1 }] },
      { ...score('d'), durationMs: Number.NaN },
      { ...score('e'), expiresAt: 'soon' },
      score('old', { expiresAt: NOW - 1 }),
      score('too-many', { taps: Array.from({ length: 401 }, (_, i) => ({ t: i, x: 1, y: 1 })) }),
    ]
    expect(parsePending([...bad, score('good')], NOW)).toEqual([score('good')])
  })

  it('returns nothing when the stored value is not a list', () => {
    expect(parsePending(undefined, NOW)).toEqual([])
    expect(parsePending({ roundId: 'a' }, NOW)).toEqual([])
  })

  it('keeps one copy of a repeated round and no more than the limit', () => {
    expect(parsePending([score('a'), score('a')], NOW)).toHaveLength(1)
    const many = Array.from({ length: MAX_PENDING + 5 }, (_, i) => score(`r${i}`))
    expect(parsePending(many, NOW)).toHaveLength(MAX_PENDING)
  })

  it('copies only the known fields', () => {
    const parsed = parsePending([{ ...score('a'), extra: 'x', taps: [{ t: 1, x: 2, y: 3, junk: true }] }], NOW)
    expect(parsed[0]).toEqual(score('a', { taps: [{ t: 1, x: 2, y: 3 }] }))
  })
})

describe('expiryOf', () => {
  it('reads the server time', () => {
    expect(expiryOf('2026-10-26T08:00:00Z', 0)).toBe(Date.parse('2026-10-26T08:00:00Z'))
  })

  it('falls back to a little under a day from now', () => {
    const at = expiryOf('not a date', NOW)
    expect(at).toBeGreaterThan(NOW)
    expect(at - NOW).toBeLessThan(24 * 60 * 60 * 1000)
  })
})

describe('ScoreQueue.submit', () => {
  it('sends once and forgets the score when the server accepts it', async () => {
    const calls: string[] = []
    const { queue, outcomes, store } = setup(async (s) => {
      calls.push(s.roundId)
      return accepted(s.roundId)
    })
    await queue.submit(score('a'))
    await settle()
    expect(calls).toEqual(['a'])
    expect(outcomes).toEqual([['a', { status: 'saved', result: accepted('a') }]])
    expect(queue.size).toBe(0)
    expect((store as ReturnType<typeof memoryStore>).data).toEqual([])
  })

  it('writes the score down before the send finishes', async () => {
    const store = memoryStore()
    let storedWhenSending: unknown = null
    const { queue } = setup(async (s) => {
      await settle()
      storedWhenSending = store.data
      return accepted(s.roundId)
    }, store)
    await queue.submit(score('a'))
    expect(storedWhenSending).toEqual([score('a')])
  })

  it('tries again right away after a network error, then succeeds', async () => {
    let calls = 0
    const { queue, outcomes } = setup(async (s) => {
      calls += 1
      if (calls < 3) throw new NetworkError('offline')
      return accepted(s.roundId)
    })
    await queue.submit(score('a'))
    expect(calls).toBe(3)
    expect(outcomes.map(([, o]) => o.status)).toEqual(['saved'])
  })

  it('keeps the score queued when every try fails', async () => {
    const { queue, outcomes, store } = setup(async () => {
      throw new NetworkError('offline')
    })
    await queue.submit(score('a'))
    await settle()
    expect(outcomes).toEqual([['a', { status: 'queued' }]])
    expect(queue.size).toBe(1)
    expect((store as ReturnType<typeof memoryStore>).data).toEqual([score('a')])
  })

  it('keeps the score after a server error or a rate limit too', async () => {
    for (const status of [429, 500, 503]) {
      const { queue, outcomes } = setup(async () => {
        throw new ApiError(status, null, 'later')
      })
      await queue.submit(score('a'))
      expect(outcomes.at(-1)).toEqual(['a', { status: 'queued' }])
      expect(queue.size).toBe(1)
    }
  })

  it('drops the score when the server refuses it for good', async () => {
    for (const status of [404, 409, 410, 422]) {
      let calls = 0
      const { queue, outcomes, store } = setup(async () => {
        calls += 1
        throw new ApiError(status, 'nope', 'refused')
      })
      await queue.submit(score('a'))
      await settle()
      expect(calls).toBe(1)
      expect(outcomes).toEqual([['a', { status: 'rejected' }]])
      expect(queue.size).toBe(0)
      expect((store as ReturnType<typeof memoryStore>).data).toEqual([])
    }
  })

  it('keeps the score after an error it does not recognise, rather than lose it', async () => {
    const { queue, outcomes } = setup(async () => {
      throw new SyntaxError('Unexpected end of JSON input')
    })
    await queue.submit(score('a'))
    expect(outcomes.at(-1)).toEqual(['a', { status: 'queued' }])
  })

  it('does not send a round that has already expired', async () => {
    let calls = 0
    const { queue, outcomes } = setup(async (s) => {
      calls += 1
      return accepted(s.roundId)
    })
    await queue.submit(score('a', { expiresAt: NOW }))
    expect(calls).toBe(0)
    expect(outcomes).toEqual([['a', { status: 'rejected' }]])
  })

  it('survives a store that cannot be written', async () => {
    const broken: PendingStore = {
      load: async () => [],
      save: async () => {
        throw new Error('quota')
      },
    }
    const { queue, outcomes } = setup(async (s) => accepted(s.roundId), broken)
    await queue.submit(score('a'))
    expect(outcomes.map(([, o]) => o.status)).toEqual(['saved'])
  })
})

describe('ScoreQueue.flush', () => {
  it('sends waiting scores oldest first', async () => {
    let offline = true
    const order: string[] = []
    const { queue, outcomes } = setup(async (s) => {
      if (offline) throw new NetworkError('offline')
      order.push(s.roundId)
      return accepted(s.roundId)
    })
    await queue.submit(score('a'))
    await queue.submit(score('b'))
    expect(queue.size).toBe(2)
    offline = false
    await queue.flush()
    expect(order).toEqual(['a', 'b'])
    expect(queue.size).toBe(0)
    expect(outcomes.filter(([, o]) => o.status === 'saved').map(([id]) => id)).toEqual(['a', 'b'])
  })

  it('stops at the first score that cannot get through, so a dead connection costs one request', async () => {
    let calls = 0
    const { queue } = setup(async () => {
      calls += 1
      throw new NetworkError('offline')
    })
    await queue.submit(score('a'))
    await queue.submit(score('b'))
    calls = 0
    await queue.flush()
    expect(calls).toBe(1)
    expect(queue.size).toBe(2)
  })

  it('carries on past a score the server refuses', async () => {
    let offline = true
    const { queue, outcomes } = setup(async (s) => {
      if (offline) throw new NetworkError('offline')
      if (s.roundId === 'a') throw new ApiError(409, 'config_mismatch', 'old')
      return accepted(s.roundId)
    })
    await queue.submit(score('a'))
    await queue.submit(score('b'))
    offline = false
    await queue.flush()
    const finals = outcomes.filter(([, o]) => o.status !== 'queued')
    expect(finals.map(([id, o]) => `${id}:${o.status}`)).toEqual(['a:rejected', 'b:saved'])
  })

  it('shares one flush between callers that overlap', async () => {
    let offline = true
    let calls = 0
    const { queue } = setup(async (s) => {
      if (offline) throw new NetworkError('offline')
      calls += 1
      await settle()
      return accepted(s.roundId)
    })
    await queue.submit(score('a'))
    offline = false
    await Promise.all([queue.flush(), queue.flush(), queue.flush()])
    expect(calls).toBe(1)
  })

  it('does nothing when nothing is waiting', async () => {
    let calls = 0
    const { queue } = setup(async (s) => {
      calls += 1
      return accepted(s.roundId)
    })
    await queue.flush()
    expect(calls).toBe(0)
  })

  it('drops a waiting score once its round has expired', async () => {
    let now = NOW
    let offline = true
    const outcomes: ScoreOutcome[] = []
    const queue = new ScoreQueue({
      send: async (s) => {
        if (offline) throw new NetworkError('offline')
        return accepted(s.roundId)
      },
      store: memoryStore(),
      now: () => now,
      retry: instant,
    })
    queue.subscribe((_, o) => outcomes.push(o))
    await queue.submit(score('a', { expiresAt: NOW + 1000 }))
    now = NOW + 5000
    offline = false
    await queue.flush()
    expect(outcomes.map((o) => o.status)).toEqual(['queued', 'rejected'])
    expect(queue.size).toBe(0)
  })
})

describe('ScoreQueue.restore', () => {
  it('picks up scores left by an earlier visit and sends them', async () => {
    const left = memoryStore([score('old1'), score('old2')])
    const sent: string[] = []
    const { queue } = setup(async (s) => {
      sent.push(s.roundId)
      return accepted(s.roundId)
    }, left)
    await queue.restore()
    expect(queue.size).toBe(2)
    await queue.flush()
    expect(sent).toEqual(['old1', 'old2'])
  })

  it('ignores damaged or expired leftovers', async () => {
    const left = memoryStore([{ nonsense: true }, score('late', { expiresAt: NOW - 5 }), score('fine')])
    const { queue } = setup(async (s) => accepted(s.roundId), left)
    await queue.restore()
    expect(queue.size).toBe(1)
  })

  it('does not count a round twice when both stores had it', async () => {
    const { queue } = setup(async (s) => accepted(s.roundId), memoryStore([score('a'), score('a')]))
    await queue.restore()
    await queue.restore()
    expect(queue.size).toBe(1)
  })

  it('starts empty when the store cannot be read', async () => {
    const broken: PendingStore = {
      load: async () => {
        throw new Error('no storage')
      },
      save: async () => undefined,
    }
    const { queue } = setup(async (s) => accepted(s.roundId), broken)
    await queue.restore()
    expect(queue.size).toBe(0)
  })

  it('keeps a score that was queued before the restore finished', async () => {
    let release: (value: unknown) => void = () => undefined
    const slow: PendingStore = {
      load: () => new Promise((resolve) => (release = resolve)),
      save: async () => undefined,
    }
    const { queue } = setup(async () => {
      throw new NetworkError('offline')
    }, slow)
    const restoring = queue.restore()
    await queue.submit(score('new'))
    release([score('old')])
    await restoring
    expect(queue.size).toBe(2)
  })
})

describe('ScoreQueue limits', () => {
  it('drops the oldest scores beyond the limit and says so', async () => {
    const { queue, outcomes } = setup(async () => {
      throw new NetworkError('offline')
    })
    for (let i = 0; i < MAX_PENDING + 2; i++) await queue.submit(score(`r${i}`))
    expect(queue.size).toBe(MAX_PENDING)
    const dropped = outcomes.filter(([, o]) => o.status === 'rejected').map(([id]) => id)
    expect(dropped).toEqual(['r0', 'r1'])
  })

  it('stops notifying a listener that unsubscribed', async () => {
    const queue = new ScoreQueue({ send: async (s) => accepted(s.roundId), store: memoryStore(), now: () => NOW })
    const heard: string[] = []
    const stop = queue.subscribe((id) => heard.push(id))
    stop()
    await queue.submit(score('a'))
    expect(heard).toEqual([])
  })
})
