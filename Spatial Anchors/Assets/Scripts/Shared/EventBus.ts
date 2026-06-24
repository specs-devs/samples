import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

type EventCallback<T = any> = (data: T) => void

/**
 * Typed pub/sub event system — singleton.
 * Non-component helper: accepts Logger via constructor or uses a default.
 */
export class EventBus {
  private static instance: EventBus

  private listeners: Map<string, Set<EventCallback>> = new Map()
  private logger: Logger

  private constructor(logger?: Logger) {
    this.logger = logger ?? new Logger("EventBus", false, true)
  }

  static getInstance(logger?: Logger): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus(logger)
    }
    return EventBus.instance
  }

  on<T = any>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback)
  }

  off<T = any>(event: string, callback: EventCallback<T>): void {
    const cbs = this.listeners.get(event)
    if (cbs) {
      cbs.delete(callback as EventCallback)
      if (cbs.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  emit<T = any>(event: string, data?: T): void {
    const cbs = this.listeners.get(event)
    if (!cbs || cbs.size === 0) {
      return
    }
    this.logger.debug(`emit: ${event}`)
    for (const cb of cbs) {
      try {
        cb(data)
      } catch (e) {
        this.logger.error(`Error in listener for "${event}": ${e}`)
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}
