/**
 * Specs Inc. 2026
 * Unique Color Service component for the BLE Playground Spectacles lens.
 */
type Vec3Fast = [number, number, number]

@component
export class UniqueColorService extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">UniqueColorService – unique color generator singleton</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks registered light materials and returns a new color that stands out from existing ones.</span>')
  @ui.separator

  private lightMats: Material[]

  private static instance: UniqueColorService

  private constructor() {
    super()
  }

  public static getInstance(): UniqueColorService {
    if (!UniqueColorService.instance) {
      throw new Error("Trying to get UniqueColorService instance, but it hasn't been set.  You need to call it later.")
    }
    return UniqueColorService.instance
  }

  onAwake() {
    if (!UniqueColorService.instance) {
      UniqueColorService.instance = this
      this.lightMats = []
    } else {
      throw new Error("UniqueColorService already has an instance.  Aborting.")
    }
  }

  registerLightVisualMat(mat: Material) {
    this.lightMats.push(mat)
  }

  getUniqueColor() {
    const currentColors: Vec3Fast[] = []
    this.lightMats.forEach((mat) => {
      currentColors.push([mat.mainPass.customColor.x, mat.mainPass.customColor.y, mat.mainPass.customColor.z])
    })

    const uniqueColor = this.generateNeonStandoutColor(currentColors)
    const uniqueColorVec4 = new vec4(uniqueColor[0], uniqueColor[1], uniqueColor[2], 1)

    return uniqueColorVec4
  }

  private generateNeonStandoutColor(existingColors: Vec3Fast[]): Vec3Fast {
    function luminance([r, g, b]: Vec3Fast): number {
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    function colorDistance(a: Vec3Fast, b: Vec3Fast): number {
      return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
    }

    function generateSaturatedColor(): Vec3Fast {
      const hue = Math.random()
      const val = Math.random() * 0.5 + 0.5

      const i = Math.floor(hue * 6)
      const f = hue * 6 - i
      const p = 0
      const q = val * (1 - f)
      const t = val * f

      switch (i % 6) {
        case 0:
          return [val, t, p]
        case 1:
          return [q, val, p]
        case 2:
          return [p, val, t]
        case 3:
          return [p, q, val]
        case 4:
          return [t, p, val]
        case 5:
          return [val, p, q]
      }
    }

    let bestColor: Vec3Fast = [1, 1, 1]
    let bestScore = -Infinity

    for (let i = 0; i < 500; i++) {
      const candidate = generateSaturatedColor()
      const brightness = luminance(candidate)
      let minDistance = Infinity

      for (const color of existingColors) {
        const dist = colorDistance(candidate, color)
        if (dist < minDistance) {
          minDistance = dist
        }
      }

      const score = minDistance * 0.7 + brightness * 0.3
      if (score > bestScore) {
        bestScore = score
        bestColor = candidate
      }
    }

    return bestColor
  }
}
