import { describe, expect, it } from 'vitest'
import type { SharePayload } from '../src/platform'
import type { SaveState } from '../src/state/flow'
import { canShare, createSharer } from '../src/state/share'

const SAVED: SaveState = {
  status: 'saved',
  result: { round_id: 'r1', status: 'accepted', score: 57, best_score: 66, is_new_best: false, rank: 3 },
}

describe('canShare', () => {
  it('is offered inside Facebook for a real score', () => {
    expect(canShare('facebook', { status: 'saving' }, 57)).toBe(true)
    expect(canShare('facebook', SAVED, 57)).toBe(true)
    expect(canShare('facebook', { status: 'queued' }, 57)).toBe(true)
  })

  it('is not offered outside Facebook, where there is no share call', () => {
    expect(canShare('mock', SAVED, 57)).toBe(false)
    expect(canShare(null, SAVED, 57)).toBe(false)
  })

  it('is not offered for a practice round or a score the server refused', () => {
    expect(canShare('facebook', { status: 'practice' }, 57)).toBe(false)
    expect(canShare('facebook', { status: 'failed' }, 57)).toBe(false)
  })

  it('is not offered for a score of nothing', () => {
    expect(canShare('facebook', SAVED, 0)).toBe(false)
  })
})

describe('createSharer', () => {
  function setup(share: (payload: SharePayload) => Promise<void>, render?: (score: number) => Promise<string>) {
    const reported: unknown[] = []
    const sent: SharePayload[] = []
    const sharer = createSharer({
      share: (payload) => {
        sent.push(payload)
        return share(payload)
      },
      render: render ?? ((score) => Promise.resolve(`data:image/png;base64,card-${score}`)),
      report: (error) => void reported.push(error),
      timeoutMs: 30,
    })
    return { sharer, reported, sent }
  }

  it('draws the card for the score and hands it to Facebook with the message', async () => {
    const { sharer, sent, reported } = setup(() => Promise.resolve())
    expect(await sharer(57)).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].imageBase64).toBe('data:image/png;base64,card-57')
    expect(sent[0].text).toContain('I scored 57 in 30 seconds')
    expect(reported).toHaveLength(0)
  })

  it('treats a closed dialog as nothing happening, and works again afterwards', async () => {
    let first = true
    const { sharer, reported, sent } = setup(() => {
      if (first) {
        first = false
        return Promise.reject({ code: 'USER_INPUT', message: 'closed' })
      }
      return Promise.resolve()
    })
    expect(await sharer(57)).toBe(false)
    expect(reported).toHaveLength(1)
    expect(await sharer(57)).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('opens the dialog once, however many times it is tapped while it is under way', async () => {
    let finish: () => void = () => undefined
    const { sharer, sent } = setup(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const first = sharer(57)
    const second = await sharer(57)
    expect(second).toBe(false)
    // Let the first reach the share call (the card is drawn first).
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(await sharer(57)).toBe(false)
    finish()
    expect(await first).toBe(true)
    expect(sent).toHaveLength(1)
  })

  it('does not open the dialog when the card could not be drawn', async () => {
    const { sharer, sent, reported } = setup(
      () => Promise.resolve(),
      () => Promise.reject(new Error('no canvas')),
    )
    expect(await sharer(57)).toBe(false)
    expect(sent).toHaveLength(0)
    expect(reported).toHaveLength(1)
  })

  it('lets go of the button when the dialog never answers', async () => {
    const { sharer, reported } = setup(() => new Promise<void>(() => undefined))
    expect(await sharer(57)).toBe(false)
    expect((reported[0] as Error).message).toContain('did not answer')
    // And it can be used again.
    expect(await sharer(58)).toBe(false)
  })
})
