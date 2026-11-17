/**
 * SPECS Inc. 2027
 * Mirror and radial symmetry applied to generated meshes and to live drawing input.
 */
import {MeshData} from "./MeshData"
import {add, normalize, P3, reflectDirection, reflectPoint, rotateAroundAxis, sub} from "./Vec"

export enum SymmetryMode {
  Off = "off",
  Mirror = "mirror",
  Radial = "radial"
}

/** Symmetry definition, expressed in the coordinate space of the geometry it applies to. */
export interface Symmetry {
  mode: SymmetryMode
  /** Plane origin (mirror) or axis origin (radial). */
  origin: P3
  /** Plane normal (mirror) or rotation axis (radial). Unit length. */
  axis: P3
  /** Number of radial copies including the original (radial only). */
  count: number
}

export function noSymmetry(): Symmetry {
  return {mode: SymmetryMode.Off, origin: {x: 0, y: 0, z: 0}, axis: {x: 1, y: 0, z: 0}, count: 1}
}

/** Number of copies a symmetry produces, including the original. */
export function symmetryCopies(sym: Symmetry): number {
  switch (sym.mode) {
    case SymmetryMode.Off:
      return 1
    case SymmetryMode.Mirror:
      return 2
    case SymmetryMode.Radial:
      return Math.max(2, Math.floor(sym.count))
  }
}

/** Maps a point into copy `k` of the symmetry (copy 0 is the identity). */
export function symmetryPoint(sym: Symmetry, p: P3, k: number): P3 {
  if (k === 0 || sym.mode === SymmetryMode.Off) {
    return p
  }
  if (sym.mode === SymmetryMode.Mirror) {
    return reflectPoint(p, sym.origin, normalize(sym.axis))
  }
  const angle = (k / symmetryCopies(sym)) * Math.PI * 2
  return add(sym.origin, rotateAroundAxis(sub(p, sym.origin), normalize(sym.axis), angle))
}

/** Maps a direction into copy `k`. */
export function symmetryDirection(sym: Symmetry, v: P3, k: number): P3 {
  if (k === 0 || sym.mode === SymmetryMode.Off) {
    return v
  }
  if (sym.mode === SymmetryMode.Mirror) {
    return reflectDirection(v, normalize(sym.axis))
  }
  const angle = (k / symmetryCopies(sym)) * Math.PI * 2
  return rotateAroundAxis(v, normalize(sym.axis), angle)
}

/** True when copy `k` flips handedness (triangle winding must be reversed). */
export function symmetryFlips(sym: Symmetry, k: number): boolean {
  return sym.mode === SymmetryMode.Mirror && k % 2 === 1
}

/** Returns `base` plus all of its symmetric copies merged in one mesh. */
export function applySymmetry(base: MeshData, sym: Symmetry): MeshData {
  const copies = symmetryCopies(sym)
  if (copies <= 1) {
    return base
  }
  const out = new MeshData()
  out.append(base)
  for (let k = 1; k < copies; k++) {
    const offset = out.vertexCount
    for (let i = 0; i < base.vertexCount; i++) {
      const p = symmetryPoint(sym, base.getPosition(i), k)
      const n = symmetryDirection(
        sym,
        {x: base.normals[i * 3], y: base.normals[i * 3 + 1], z: base.normals[i * 3 + 2]},
        k
      )
      out.positions.push(p.x, p.y, p.z)
      out.normals.push(n.x, n.y, n.z)
    }
    const flip = symmetryFlips(sym, k)
    for (let t = 0; t < base.indices.length; t += 3) {
      if (flip) {
        out.indices.push(base.indices[t] + offset, base.indices[t + 2] + offset, base.indices[t + 1] + offset)
      } else {
        out.indices.push(base.indices[t] + offset, base.indices[t + 1] + offset, base.indices[t + 2] + offset)
      }
    }
  }
  return out
}
