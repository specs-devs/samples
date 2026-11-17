import {setTimeout} from "InteractionKit.lspkg/Utils/FunctionTimingUtils"

/**
 * An awaitable function the will delay for approximately a frame.
 *
 * @remarks - Useful for allowing newly instantiated objects to initialize.
 */
export async function delayAFrame(milliseconds: number = 10): Promise<void> {
  const done = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, milliseconds)
  })
  return done
}
