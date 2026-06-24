/**
 * Specs Inc. 2026
 * Gemini API — sends image + text to Gemini, parses structured bounding box response,
 * and converts to pixel-space points for depth cache world position resolution.
 */
import {Gemini} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini"
import {GeminiTypes} from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

interface GeminiPoint {
  pixelPos: vec2
  label: string
  showArrow: boolean
}

interface GeminiLine {
  startPos: vec2
  endPos: vec2
}

export interface GeminiResponse {
  aiMessage: string
  points: GeminiPoint[]
  lines: GeminiLine[]
}

const SYSTEM_MESSAGE: string =
  "You are an AI inside of augmented reality glasses. " +
  "Return bounding boxes as a JSON array with labels, your answer should be a JSON object with 2 keys: 'message' and 'data'. " +
  "The 'data' key should contain an array of objects, each with a label and coordinates of a bounding box. " +
  "Set showArrow to true most of the time to create arrow visuals in the scene.\n" +
  "Return bounding boxes as a JSON array with labels. Never return masks or code fencing. Limit to 25 objects.\n" +
  "If an object is present multiple times, name them according to their unique characteristic (colors, size, position, etc.).\n" +
  "Do not label anything over 20 feet away from the camera.\n" +
  "Do not label objects that you already labeled.\n"

@component
export class GeminiAPI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GeminiAPI – Gemini multi-modal vision API wrapper</span>')
  @ui.separator

  @input
  @hint("Gemini model identifier to use for inference")
  model: string = "gemini-2.0-flash"

  @ui.separator
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("GeminiAPI", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  makeGeminiRequest(imageTex: Texture, textQuery: string, callback: (response: GeminiResponse) => void) {
    Base64.encodeTextureAsync(
      imageTex,
      (base64Image: string) => {
        this.logger.debug("Image encoded, sending to Gemini...")
        this.sendGeminiChat(textQuery, base64Image, imageTex, callback)
      },
      () => {
        this.logger.error("Failed to encode texture for Gemini request")
        callback({aiMessage: "Error: texture encoding failed", points: [], lines: []})
      },
      CompressionQuality.LowQuality,
      EncodingType.Jpg
    )
  }

  private sendGeminiChat(
    request: string,
    image64: string,
    texture: Texture,
    callback: (response: GeminiResponse) => void
  ) {
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
      model: this.model,
      type: "generateContent",
      body: {
        contents: [
          {
            role: "user",
            parts: [
              {inlineData: {mimeType: "image/jpeg", data: image64}},
              {text: request}
            ]
          }
        ],
        systemInstruction: {
          parts: [{text: SYSTEM_MESSAGE}]
        },
        generationConfig: {
          temperature: 0.5,
          responseMimeType: "application/json",
          response_schema: respSchema
        }
      }
    }

    Gemini.models(reqObj)
      .then((response) => {
        try {
          const text: string = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
          const responseObj = JSON.parse(text)
          this.logger.info("Gemini response message: " + responseObj.message)
          this.onGeminiResponse(responseObj, texture, callback)
        } catch (e) {
          this.logger.error("Failed to parse Gemini response: " + e)
          callback({aiMessage: "Parse error", points: [], lines: []})
        }
      })
      .catch((error) => {
        this.logger.error("Gemini request failed: " + error)
        callback({aiMessage: "Error: " + error, points: [], lines: []})
      })
  }

  private onGeminiResponse(
    responseObj: any,
    texture: Texture,
    callback: (response: GeminiResponse) => void
  ) {
    const result: GeminiResponse = {
      aiMessage: responseObj.message ?? "no response",
      points: [],
      lines: []
    }

    try {
      const data: any[] = responseObj.data ?? []
      this.logger.debug("Gemini returned " + data.length + " detections")

      for (let i = 0; i < data.length; i++) {
        const centerPoint: vec2 = this.boundingBoxToPixels(
          data[i].boundingBox,
          texture.getWidth(),
          texture.getHeight()
        )
        result.points.push({
          pixelPos: centerPoint,
          label: data[i].label,
          showArrow: data[i].useArrow ?? true
        })
      }
    } catch (error) {
      this.logger.error("Error parsing detections: " + error)
    }

    callback(result)
  }

  private boundingBoxToPixels(boxPoints: number[], width: number, height: number): vec2 {
    // Gemini returns bounding boxes as [y1, x1, y2, x2] in 0-1000 range
    const x1: number = MathUtils.remap(boxPoints[1], 0, 1000, 0, width)
    const y1: number = MathUtils.remap(boxPoints[0], 0, 1000, height, 0)
    const topLeft: vec2 = new vec2(x1, height - y1)
    const x2: number = MathUtils.remap(boxPoints[3], 0, 1000, 0, width)
    const y2: number = MathUtils.remap(boxPoints[2], 0, 1000, height, 0)
    const bottomRight: vec2 = new vec2(x2, height - y2)
    const center: vec2 = topLeft.add(bottomRight).uniformScale(0.5)
    return center
  }
}
