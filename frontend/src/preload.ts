export type PreloadTask = () => Promise<unknown>

/**
 * Run loading tasks (images, fonts) side by side and report progress.
 *
 * Never rejects: a missing image must not keep the game from starting. A task that
 * takes longer than `timeoutMs` is given up on and counted as done, so a slow
 * network delays the first screen by a few seconds at most.
 */
export async function runPreload(
  tasks: readonly PreloadTask[],
  onProgress: (fraction: number) => void,
  timeoutMs = 4000,
): Promise<void> {
  if (tasks.length === 0) {
    onProgress(1)
    return
  }
  let finished = 0
  await Promise.all(
    tasks.map(
      (task) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeoutMs)
          Promise.resolve()
            .then(task)
            .catch(() => undefined)
            .then(() => {
              clearTimeout(timer)
              resolve()
            })
        }).then(() => {
          finished += 1
          onProgress(finished / tasks.length)
        }),
    ),
  )
}
