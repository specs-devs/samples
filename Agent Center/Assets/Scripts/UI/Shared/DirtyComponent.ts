export const LAYOUT_DIRTY = 1 << 0;
export const STATE_DIRTY = 1 << 1;

/**
 * Base class for UI components that use a deferred dirty-flag update pattern.
 *
 * Centralizes the two-atom boilerplate (flag + UpdateEvent) that was duplicated
 * across every component. Subclasses call markDirty() to schedule work and
 * implement onFlush(flags) to perform it. Components that also need continuous
 * per-frame tracking (e.g. following a robot) implement onTrack() and call
 * setTracking(true/false) to start/stop it.
 *
 * The internal UpdateEvent is self-disabling: it runs only when there is pending
 * dirty work or active tracking, and disables itself when both are complete.
 */
export abstract class DirtyComponent extends BaseScriptComponent {
  private _dirtyFlags = 0;
  private _tracking = false;
  private _updateEvent: SceneEvent | null = null;

  /**
   * Lazily creates the UpdateEvent on first use. Lens Studio may call public
   * methods (e.g. syncAgents) before onAwake() fires, so we cannot rely on
   * onAwake() having run before markDirty() is first called.
   */
  private get _event(): SceneEvent {
    if (!this._updateEvent) {
      this._updateEvent = this.createEvent("UpdateEvent");
      this._updateEvent.bind(() => this._tick());
      this._updateEvent.enabled = false;
    }
    return this._updateEvent;
  }

  onAwake(): void {
    // Touch the getter so the event exists; no-op if already lazily created.
    void this._event;
  }

  /** Schedule a deferred flush. Multiple calls in the same frame are coalesced. */
  protected markDirty(flag: number = LAYOUT_DIRTY): void {
    this._dirtyFlags |= flag;
    this._event.enabled = true;
  }

  /**
   * Cancel all pending dirty flags without flushing.
   * Use when switching modes that perform their own synchronous layout.
   */
  protected clearDirty(): void {
    this._dirtyFlags = 0;
    if (!this._tracking && this._updateEvent) {
      this._updateEvent.enabled = false;
    }
  }

  /**
   * Enable or disable per-frame tracking (onTrack calls).
   * Tracking and dirty flushing share one event; either one keeps it alive.
   */
  protected setTracking(on: boolean): void {
    const wasTracking = this._tracking;
    this._tracking = on;
    this._event.enabled = on || this._dirtyFlags !== 0;
  }

  private _tick(): void {
    if (this._dirtyFlags !== 0) {
      const f = this._dirtyFlags;
      this._dirtyFlags = 0;
      this.onFlush(f);
    }
    if (this._tracking) {
      this.onTrack();
    }
    if (!this._tracking && this._dirtyFlags === 0) {
      this._updateEvent!.enabled = false;
    }
  }

  /** Called once per deferred flush. Implement layout/state work here. */
  protected abstract onFlush(flags: number): void;

  /** Called every frame while tracking is active. Override to add per-frame logic. */
  protected onTrack(): void {}
}
