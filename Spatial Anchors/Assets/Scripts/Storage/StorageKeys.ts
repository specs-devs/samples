/**
 * Centralized storage key constants and helpers for persistent storage.
 */

/** Root prefix for all spatial persistence keys. */
export const STORAGE_PREFIX: string = "SPATIAL_API_KEY"

/** Sub-key for the area name-to-id mapping. */
export const AREAS_KEY: string = "AREAS_KEY"

/** Sub-key for widget transform matrices. */
export const TRANSFORM_KEY: string = "TRANSFORM_KEY"

/** Sub-key for widget type identifiers. */
export const TYPE_KEY: string = "TYPE_KEY"

/** Sub-key for widget serialized content strings. */
export const CONTENT_KEY: string = "CONTENT_KEY"

/** Sub-key for the saved anchor pose (widgetParent world transform). */
export const ANCHOR_POSE_KEY: string = "ANCHOR_POSE_KEY"

/**
 * Returns the storage key prefix scoped to a specific area.
 * @param areaName - The human-readable area/space name.
 * @returns Prefixed key string for that area.
 */
export function areaKey(areaName: string): string {
  return `${STORAGE_PREFIX}_${areaName}`
}

/**
 * Returns the fully-qualified storage key for widget data within an area.
 * @param areaName - The area name.
 * @param subKey - One of TRANSFORM_KEY, TYPE_KEY, or CONTENT_KEY.
 * @returns Fully-qualified storage key.
 */
export function widgetKey(areaName: string, subKey: string): string {
  return `${STORAGE_PREFIX}_${areaName}_${subKey}`
}

/**
 * Returns the storage key for the global areas map.
 * @returns Fully-qualified key for the areas record.
 */
export function areasMapKey(): string {
  return `${STORAGE_PREFIX}_${AREAS_KEY}`
}
