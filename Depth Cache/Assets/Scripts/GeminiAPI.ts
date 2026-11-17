/**
 * SPECS Inc. 2027
 * Gemini API component for the Depth Cache Glasses lens.
 */
import {Gemini} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini"
import {GeminiTypes} from "RemoteServiceGateway.lspkg/HostedExternal/GeminiTypes"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

// Flash answers in a few seconds; Pro (a slow "thinking" model) often ran past the request timeout.
const GEMINI_MODEL = "gemini-2.5-flash"
// Most labels returned for one frame.
const MAX_LABELS = 10
// Two labels whose boxes overlap more than this (intersection over union) are the same object.
const DUPLICATE_IOU = 0.5

const SYSTEM_MESSAGE =
  "You are an AI inside of augmented reality glasses. " +
  "Answer with a JSON object with two keys: 'message' (a short answer for the user) and 'data' (an array of labelled objects, " +
  "each with 'label', 'boundingBox' [ymin, xmin, ymax, xmax] normalized to 0-1000, and 'useArrow').\n" +
  "Set useArrow to true when the user asks where something is or how to do a task; the label then works well as Step #1, Step #2, etc.\n" +
  "Return one entry per physical object: never two boxes for the same object, and no overlapping boxes. " +
  "If the same kind of object appears more than once, tell them apart in the label (color, size, position).\n" +
  "Return at most " + MAX_LABELS + " objects. Don't label anything more than 6 meters from the camera. Never return masks or code fencing.\n"

@component
export class GeminiAPI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GeminiAPI – Gemini vision API integration</span><br/><span style="color: #94A3B8; font-size: 11px;">Sends camera frames to Gemini and parses bounding box responses.</span>')
  @ui.separator

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("GeminiAPI", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  makeGeminiRequest(texture: Texture, userQuery: string, callback: (any) => void) {
    print(`[GeminiDebug] makeGeminiRequest: encoding ${texture.getWidth()}x${texture.getHeight()} texture, query="${userQuery}"`)
    Base64.encodeTextureAsync(
      texture,
      (base64String) => {
        this.logger.info("Making image request...")
        print("[GeminiDebug] texture encoded, sending request to Gemini…")
        this.sendGeminiChat(userQuery, base64String, texture, callback)
      },
      () => {
        this.logger.error("Image encoding failed!")
        print("[GeminiDebug] ERROR: texture encoding failed — no request sent, no dots")
      },
      // A JPG is a fraction of the size of a PNG, which keeps the request well under the gateway limits.
      CompressionQuality.IntermediateQuality,
      EncodingType.Jpg
    )
  }

  sendGeminiChat(request: string, image64: string, texture: Texture, callback: (response: any) => void) {
    const respSchema: GeminiTypes.Common.Schema = {
      type: "object",
      properties: {
        message: {type: "string"},
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              boundingBox: {
                type: "array",
                items: {type: "number"}
              },
              label: {type: "string"},
              useArrow: {type: "boolean"}
            },
            required: ["boundingBox", "label", "useArrow"]
          }
        }
      },
      required: ["message", "data"]
    }

    const reqObj: GeminiTypes.Models.GenerateContentRequest = {
      model: GEMINI_MODEL,
      type: "generateContent",
      body: {
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: image64
                }
              },
              {
                text: request
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_MESSAGE
            }
          ]
        },
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: respSchema
        }
      }
    }

    this.logger.debug(JSON.stringify(reqObj.body))

    Gemini.models(reqObj)
      .then((response) => {
        print("[GeminiDebug] Gemini response received, parsing…")
        const candidate = response && response.candidates ? response.candidates[0] : null
        const parts = candidate && candidate.content && candidate.content.parts ? candidate.content.parts : []
        const textPart = parts.filter((part) => part && typeof part.text === "string")[0]
        if (!textPart) {
          const reason = candidate ? candidate.finishReason : JSON.stringify((response as any)?.promptFeedback || {})
          print("[GeminiDebug] ERROR: Gemini answered without text (" + reason + ")")
          this.fail(callback, "Gemini didn't return an answer for this view. Try again or rephrase the question.")
          return
        }
        let responseObj: any
        try {
          responseObj = JSON.parse(textPart.text)
        } catch (error) {
          print("[GeminiDebug] ERROR: could not parse Gemini JSON (" + (candidate ? candidate.finishReason : "?") + "): " + textPart.text.substring(0, 200))
          this.fail(callback, "Gemini's answer was cut off. Try again with a shorter question.")
          return
        }
        this.onGeminiResponse(responseObj, texture, callback)
      })
      .catch((error) => {
        this.logger.error("Gemini error: " + error)
        print("[GeminiDebug] ERROR: Gemini request failed: " + error)
        this.fail(callback, "Gemini request failed. Check the Remote Service Gateway token and your connection, then try again.")
      })
  }

  private fail(callback: (response: any) => void, message: string) {
    if (callback != null) {
      callback({points: [], lines: [], aiMessage: message})
    }
  }

  private onGeminiResponse(responseObj: any, texture: Texture, callback: (response: any) => void) {
    const geminiResult = {
      points: [],
      aiMessage: "no response"
    }
    try {
      geminiResult.aiMessage = responseObj && responseObj.message ? responseObj.message : "no response"
      this.logger.info("GEMINI RESPONSE: " + geminiResult.aiMessage)
      const data = this.removeDuplicates(Array.isArray(responseObj.data) ? responseObj.data : [])
      this.logger.debug("Data: " + JSON.stringify(data))
      print(`[GeminiDebug] parsed ${data.length} bounding box(es) from response`)
      for (let i = 0; i < data.length; i++) {
        const centerPoint = this.boundingBoxToPixels(data[i].boundingBox, texture.getWidth(), texture.getHeight())
        const lensStudioPoint = {
          pixelPos: centerPoint,
          label: data[i].label,
          showArrow: data[i].useArrow
        }
        geminiResult.points.push(lensStudioPoint)
      }
    } catch (error) {
      this.logger.error("Error parsing points!: " + error)
    }
    if (callback != null) {
      callback(geminiResult)
    }
  }

  /**
   * Drops entries that describe an object already in the list: same label, or a box overlapping an
   * earlier box by more than DUPLICATE_IOU. Keeps at most MAX_LABELS entries.
   */
  private removeDuplicates(data: any[]): any[] {
    const kept: any[] = []
    for (const item of data) {
      const box = item && item.boundingBox
      if (!Array.isArray(box) || box.length < 4) {
        continue
      }
      const label = ("" + item.label).trim().toLowerCase()
      const duplicate = kept.some((other) => ("" + other.label).trim().toLowerCase() === label || iou(box, other.boundingBox) > DUPLICATE_IOU)
      if (!duplicate) {
        kept.push(item)
      }
      if (kept.length >= MAX_LABELS) {
        break
      }
    }
    return kept
  }

  private boundingBoxToPixels(boxPoints: any, width: number, height: number): vec2 {
    const x1 = MathUtils.remap(boxPoints[1], 0, 1000, 0, width)
    const y1 = MathUtils.remap(boxPoints[0], 0, 1000, height, 0)
    const topLeft = new vec2(x1, height - y1)
    const x2 = MathUtils.remap(boxPoints[3], 0, 1000, 0, width)
    const y2 = MathUtils.remap(boxPoints[2], 0, 1000, height, 0)
    const bottomRight = new vec2(x2, height - y2)
    const center = topLeft.add(bottomRight).uniformScale(0.5)
    return center
  }
}

// Intersection over union of two [ymin, xmin, ymax, xmax] boxes.
function iou(a: number[], b: number[]): number {
  const y1 = Math.max(a[0], b[0])
  const x1 = Math.max(a[1], b[1])
  const y2 = Math.min(a[2], b[2])
  const x2 = Math.min(a[3], b[3])
  const inter = Math.max(0, y2 - y1) * Math.max(0, x2 - x1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}
