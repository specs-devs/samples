/**
 * SPECS Inc. 2027
 * Minimal typed event used across the Industrial Sketch lens.
 */
export class Signal<T = void> {
  private listeners: ((value: T) => void)[] = []

  add(listener: (value: T) => void): () => void {
    this.listeners.push(listener)
    return () => this.remove(listener)
  }

  remove(listener: (value: T) => void): void {
    const i = this.listeners.indexOf(listener)
    if (i >= 0) {
      this.listeners.splice(i, 1)
    }
  }

  emit(value: T): void {
    // Copy so listeners can unsubscribe while being notified.
    for (const listener of this.listeners.slice()) {
      try {
        listener(value)
      } catch (e) {
        print("Industrial Sketch: listener error: " + e)
      }
    }
  }
}
