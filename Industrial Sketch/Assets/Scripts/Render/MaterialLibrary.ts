/**
 * SPECS Inc. 2027
 * Shared material instances per (color, preset), cloned from the project's PBR and unlit base materials.
 */
import {MaterialPreset} from "../Core/SketchTypes"

interface PresetParams {
  metallic: number
  roughness: number
}

const PRESET_PARAMS: Record<MaterialPreset, PresetParams> = {
  [MaterialPreset.Matte]: {metallic: 0, roughness: 0.92},
  [MaterialPreset.Satin]: {metallic: 0, roughness: 0.5},
  [MaterialPreset.Gloss]: {metallic: 0, roughness: 0.12},
  // SPECS uses an additive display, where black is transparent: fully metallic surfaces only show the
  // (dim) environment reflection and nearly vanish, so metals keep some diffuse color.
  [MaterialPreset.Metal]: {metallic: 0.4, roughness: 0.3},
  [MaterialPreset.Chrome]: {metallic: 0.5, roughness: 0.06},
  [MaterialPreset.Flat]: {metallic: 0, roughness: 1}
}

function colorKey(c: [number, number, number]): string {
  return Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255)
}

export class MaterialLibrary {
  private cache = new Map<string, Material>()

  constructor(
    private readonly pbrBase: Material,
    private readonly unlitBase: Material
  ) {}

  /** Material for sketch geometry. Instances are shared: never modify the returned material. */
  get(color: [number, number, number], preset: MaterialPreset, highlight: boolean = false): Material {
    const key = preset + "|" + colorKey(color) + (highlight ? "|h" : "")
    let mat = this.cache.get(key)
    if (!mat) {
      const c = highlight ? brighten(color) : color
      if (preset === MaterialPreset.Flat) {
        mat = this.unlitBase.clone()
        mat.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1)
      } else {
        const p = PRESET_PARAMS[preset]
        mat = this.pbrBase.clone()
        mat.mainPass.baseColor = new vec4(c[0], c[1], c[2], 1)
        mat.mainPass.metallic = p.metallic
        mat.mainPass.roughness = p.roughness
      }
      this.cache.set(key, mat)
    }
    return mat
  }

  /** Unlit material for gizmos, handles and guides. */
  unlit(color: [number, number, number]): Material {
    const key = "unlit|" + colorKey(color)
    let mat = this.cache.get(key)
    if (!mat) {
      mat = this.unlitBase.clone()
      mat.mainPass.baseColor = new vec4(color[0], color[1], color[2], 1)
      this.cache.set(key, mat)
    }
    return mat
  }
}

function brighten(c: [number, number, number]): [number, number, number] {
  return [Math.min(1, c[0] * 0.6 + 0.45), Math.min(1, c[1] * 0.6 + 0.45), Math.min(1, c[2] * 0.6 + 0.45)]
}
