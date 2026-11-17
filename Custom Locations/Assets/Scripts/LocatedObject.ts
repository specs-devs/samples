/**
 * Glasses Inc. 2026
 * Defines objects or functionality that is bound to a real-life location. Designed to be used with
 * {@link LocatedAtComponent} and {@link CustomLocationGroupComponent} through
 * {@link ActivateWhenInCameraView}.
 */
export interface LocatedObject {
  /**
   * Called when the user is in the presence of this object (close enough and looking at it).
   */
  activate(): void

  /**
   * Called when the user is no longer in the presence of this object.
   */
  deactivate(): void

  /**
   * Called once, when the location this object belongs to is first found (localized).
   */
  localize(): void
}
