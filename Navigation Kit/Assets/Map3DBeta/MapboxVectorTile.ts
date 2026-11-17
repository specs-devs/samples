/**
 * SPECS Inc. 2027
 * MapboxVectorTile [BETA] – minimal Mapbox Vector Tile (MVT v2, protobuf) decoder for Map3D.
 *
 * Only what Map3D needs: layer names, feature properties and polygon/point geometry.
 * Input must be the raw (un-gzipped) protobuf; use isGzip() to detect a compressed body.
 * Spec: https://github.com/mapbox/vector-tile-spec/tree/master/2.1
 */

export type TileValue = string | number | boolean | null

export type TilePoint = {x: number; y: number}

export type TileFeature = {
  type: number // 1 point, 2 linestring, 3 polygon
  properties: {[key: string]: TileValue}
  /** Rings (polygons/lines) or points, in tile units (0..extent, y down). */
  rings: TilePoint[][]
}

export type TileLayer = {
  name: string
  extent: number
  features: TileFeature[]
}

export const GEOM_POINT = 1
export const GEOM_LINESTRING = 2
export const GEOM_POLYGON = 3

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

class PbfReader {
  pos = 0
  private view: DataView

  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  get length(): number {
    return this.buf.length
  }

  varint(): number {
    let result = 0
    let mul = 1
    let b = 0
    do {
      if (this.pos >= this.buf.length) throw new Error("MVT: truncated varint")
      b = this.buf[this.pos++]
      result += (b & 0x7f) * mul
      mul *= 128
    } while (b >= 0x80)
    return result
  }

  svarint(): number {
    const n = this.varint()
    return n % 2 === 1 ? (n + 1) / -2 : n / 2
  }

  float(): number {
    const v = this.view.getFloat32(this.pos, true)
    this.pos += 4
    return v
  }

  double(): number {
    const v = this.view.getFloat64(this.pos, true)
    this.pos += 8
    return v
  }

  bytesView(): Uint8Array {
    const len = this.varint()
    const start = this.pos
    this.pos += len
    return this.buf.subarray(start, start + len)
  }

  string(): string {
    return utf8Decode(this.bytesView())
  }

  packedVarints(): number[] {
    const end = this.varint() + this.pos
    const out: number[] = []
    while (this.pos < end) out.push(this.varint())
    return out
  }

  skip(wireType: number): void {
    if (wireType === 0) this.varint()
    else if (wireType === 1) this.pos += 8
    else if (wireType === 2) this.pos += this.varint()
    else if (wireType === 5) this.pos += 4
    else throw new Error("MVT: unsupported wire type " + wireType)
  }
}

function utf8Decode(b: Uint8Array): string {
  let out = ""
  let i = 0
  while (i < b.length) {
    const c = b[i++]
    let cp = c
    if (c >= 0xf0) {
      cp = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f)
    } else if (c >= 0xe0) {
      cp = ((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f)
    } else if (c >= 0xc0) {
      cp = ((c & 0x1f) << 6) | (b[i++] & 0x3f)
    }
    if (cp > 0xffff) {
      cp -= 0x10000
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    } else {
      out += String.fromCharCode(cp)
    }
  }
  return out
}

function readValue(r: PbfReader, end: number): TileValue {
  let v: TileValue = null
  while (r.pos < end) {
    const tag = r.varint()
    const field = tag >> 3
    const wire = tag & 7
    if (field === 1) v = r.string()
    else if (field === 2) v = r.float()
    else if (field === 3) v = r.double()
    else if (field === 4) v = r.varint() // int64 (negative values unsupported; not used by building/poi fields)
    else if (field === 5) v = r.varint()
    else if (field === 6) v = r.svarint()
    else if (field === 7) v = r.varint() !== 0
    else r.skip(wire)
  }
  return v
}

function decodeGeometry(cmds: number[]): TilePoint[][] {
  const rings: TilePoint[][] = []
  let ring: TilePoint[] | null = null
  let x = 0
  let y = 0
  let i = 0
  while (i < cmds.length) {
    const cmdInt = cmds[i++]
    const id = cmdInt & 7
    const count = cmdInt >> 3
    if (id === 1 || id === 2) {
      for (let k = 0; k < count && i + 1 < cmds.length; k++) {
        const dx = cmds[i++]
        const dy = cmds[i++]
        x += dx % 2 === 1 ? (dx + 1) / -2 : dx / 2
        y += dy % 2 === 1 ? (dy + 1) / -2 : dy / 2
        if (id === 1) {
          ring = []
          rings.push(ring)
        }
        if (ring) ring.push({x, y})
      }
    } else if (id === 7) {
      // ClosePath: rings are treated as implicitly closed.
    } else {
      break
    }
  }
  return rings
}

/**
 * Decodes the requested layers of a vector tile. Layers not listed in `wanted` are skipped cheaply.
 */
export function decodeVectorTile(bytes: Uint8Array, wanted: string[]): TileLayer[] {
  const r = new PbfReader(bytes)
  const layers: TileLayer[] = []
  while (r.pos < r.length) {
    const tag = r.varint()
    if (tag >> 3 === 3 && (tag & 7) === 2) {
      const layer = decodeLayer(r.bytesView(), wanted)
      if (layer) layers.push(layer)
    } else {
      r.skip(tag & 7)
    }
  }
  return layers
}

function decodeLayer(buf: Uint8Array, wanted: string[]): TileLayer | null {
  const r = new PbfReader(buf)
  let name = ""
  let extent = 4096
  const keys: string[] = []
  const values: TileValue[] = []
  const rawFeatures: Uint8Array[] = []
  while (r.pos < r.length) {
    const tag = r.varint()
    const field = tag >> 3
    const wire = tag & 7
    if (field === 1) name = r.string()
    else if (field === 2) rawFeatures.push(r.bytesView())
    else if (field === 3) keys.push(r.string())
    else if (field === 4) {
      const len = r.varint()
      const end = r.pos + len
      values.push(readValue(r, end))
      r.pos = end
    } else if (field === 5) extent = r.varint()
    else r.skip(wire)
  }
  if (wanted.indexOf(name) < 0) return null

  const features: TileFeature[] = []
  for (const fb of rawFeatures) {
    const fr = new PbfReader(fb)
    let type = 0
    let tags: number[] = []
    let geom: number[] = []
    while (fr.pos < fr.length) {
      const tag = fr.varint()
      const field = tag >> 3
      if (field === 2) tags = fr.packedVarints()
      else if (field === 3) type = fr.varint()
      else if (field === 4) geom = fr.packedVarints()
      else fr.skip(tag & 7)
    }
    const properties: {[key: string]: TileValue} = {}
    for (let i = 0; i + 1 < tags.length; i += 2) {
      const k = keys[tags[i]]
      if (k !== undefined) properties[k] = values[tags[i + 1]] ?? null
    }
    features.push({type, properties, rings: decodeGeometry(geom)})
  }
  return {name, extent, features}
}

/** Signed ring area in tile units (shoelace). Sign tells exterior vs. hole within one feature. */
export function ringArea(ring: TilePoint[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j].x - ring[i].x) * (ring[i].y + ring[j].y)
  }
  return a / 2
}
