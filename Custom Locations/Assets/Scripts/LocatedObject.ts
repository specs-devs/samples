/**
 * Defines objects or functionality that it bound to a real life location.
 * Designed to be used with {@link LocatedAtComponent} and {@link CustomLocationGroup}.
 */
export interface LocatedObject {
  /**
   * Called with the user is in the presence of this object.
   */
  activate(): void

  /**
   * Called with the users is no longer in the presence of this object
   */
  deactivate(): void

  /**
   * Called with the object is initially found.
   */
  localize(): void
}
