/**
 * SPECS Inc. 2027
 * Saves sketches on the device with the Persistent Storage System: numbered slots plus a rolling autosave
 * that is restored on launch.
 */
import {
  compactItem,
  isValidItem,
  isValidViewpoint,
  SKETCH_FORMAT_VERSION,
  SketchFile,
  SketchItem,
  Viewpoint
} from "../Core/SketchTypes"

export const SLOT_COUNT = 4
const SLOT_PREFIX = "industrialSketch.slot."
const AUTOSAVE_KEY = "industrialSketch.autosave"

export interface SlotInfo {
  slot: number
  used: boolean
  name: string
  savedAt: number
  itemCount: number
}

export class SketchStorage {
  private store: GeneralDataStore | null

  constructor() {
    try {
      this.store = global.persistentStorageSystem.store
    } catch (e) {
      print("Industrial Sketch: persistent storage unavailable: " + e)
      this.store = null
    }
  }

  get available(): boolean {
    return this.store !== null
  }

  /** Bytes used / available, or null when storage is unavailable. */
  usage(): {used: number; max: number} | null {
    if (!this.store) {
      return null
    }
    try {
      return {used: this.store.getSizeInBytes(), max: this.store.getMaxSizeInBytes()}
    } catch {
      return null
    }
  }

  static serialize(name: string, items: SketchItem[], viewScale: number, viewpoints?: (Viewpoint | null)[]): string {
    const file: SketchFile = {
      format: "industrial-sketch",
      version: SKETCH_FORMAT_VERSION,
      name,
      savedAt: Date.now(),
      items: items.map(compactItem),
      viewScale
    }
    if (viewpoints && viewpoints.some((v) => !!v)) {
      file.viewpoints = viewpoints
    }
    return JSON.stringify(file)
  }

  /** Parses and validates a sketch file. Invalid items are dropped; returns null for unreadable data. */
  static deserialize(json: string): SketchFile | null {
    try {
      const data = JSON.parse(json) as SketchFile
      if (!data || data.format !== "industrial-sketch" || !Array.isArray(data.items)) {
        return null
      }
      if (typeof data.version !== "number" || data.version > SKETCH_FORMAT_VERSION) {
        print("Industrial Sketch: sketch saved by a newer version (" + data.version + ")")
      }
      data.items = data.items.filter(isValidItem)
      if (data.viewpoints !== undefined) {
        data.viewpoints = Array.isArray(data.viewpoints)
          ? data.viewpoints.map((v) => (isValidViewpoint(v) ? v : null))
          : undefined
      }
      return data
    } catch (e) {
      print("Industrial Sketch: could not read sketch: " + e)
      return null
    }
  }

  /** Writes a slot. Returns an error message, or null on success. */
  save(
    slot: number,
    name: string,
    items: SketchItem[],
    viewScale: number,
    viewpoints?: (Viewpoint | null)[]
  ): string | null {
    return this.write(SLOT_PREFIX + slot, SketchStorage.serialize(name, items, viewScale, viewpoints))
  }

  load(slot: number): SketchFile | null {
    return this.read(SLOT_PREFIX + slot)
  }

  clearSlot(slot: number): void {
    if (this.store && this.store.has(SLOT_PREFIX + slot)) {
      this.store.remove(SLOT_PREFIX + slot)
    }
  }

  autosave(items: SketchItem[], viewScale: number, viewpoints?: (Viewpoint | null)[]): string | null {
    if (items.length === 0) {
      if (this.store && this.store.has(AUTOSAVE_KEY)) {
        this.store.remove(AUTOSAVE_KEY)
      }
      return null
    }
    return this.write(AUTOSAVE_KEY, SketchStorage.serialize("Autosave", items, viewScale, viewpoints))
  }

  loadAutosave(): SketchFile | null {
    return this.read(AUTOSAVE_KEY)
  }

  slots(): SlotInfo[] {
    const out: SlotInfo[] = []
    for (let slot = 1; slot <= SLOT_COUNT; slot++) {
      const file = this.load(slot)
      out.push({
        slot,
        used: !!file,
        name: file ? file.name : "Empty",
        savedAt: file ? file.savedAt : 0,
        itemCount: file ? file.items.length : 0
      })
    }
    return out
  }

  private write(key: string, json: string): string | null {
    if (!this.store) {
      return "Storage unavailable"
    }
    try {
      const max = this.store.getMaxSizeInBytes()
      const existing = this.store.has(key) ? this.store.getString(key).length : 0
      const projected = this.store.getSizeInBytes() - existing + json.length
      if (max > 0 && projected > max) {
        return "Not enough storage (" + Math.round(json.length / 1024) + " KB needed)"
      }
      this.store.putString(key, json)
      return null
    } catch (e) {
      return "Save failed: " + e
    }
  }

  private read(key: string): SketchFile | null {
    if (!this.store || !this.store.has(key)) {
      return null
    }
    try {
      return SketchStorage.deserialize(this.store.getString(key))
    } catch {
      return null
    }
  }
}
