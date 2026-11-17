/**
 * SPECS Inc. 2027
 * Image Generator component for the AI Playground Glasses lens.
 */
import {Gemini} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini"
import {GeminiTypes} from "RemoteServiceGateway.lspkg/HostedExternal/GeminiTypes"
import {OpenAI} from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI"
import {OpenAITypes} from "RemoteServiceGateway.lspkg/HostedExternal/OpenAITypes"
import {Promisfy} from "RemoteServiceGateway.lspkg/Utils/Promisfy"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

export class ImageGenerator {
  private rmm = require("LensStudio:RemoteMediaModule") as RemoteMediaModule
  private model: string
  private logger: Logger
  /** Base64 PNG of the last generated or edited image; editImage() edits this image. */
  private lastImageB64: string | null = null
  private lastImageMime = "image/png"

  constructor(model: string, logger?: Logger) {
    this.model = model
    this.logger = logger
  }

  generateImage(prompt: string): Promise<Texture> {
    if (this.model === "OpenAI") {
      return this.generateWithOpenAI(prompt)
    } else {
      return this.generateWithGemini(prompt)
    }
  }

  /** Whether there is an image to edit. */
  hasImage(): boolean {
    return this.lastImageB64 !== null
  }

  /**
   * Edits the last generated image with an instruction ("add a hat", "make it night").
   * Uses the image bytes the API returned, so no texture is ever encoded on the device.
   */
  editImage(prompt: string): Promise<Texture> {
    if (!this.lastImageB64) {
      return Promise.reject("No image to edit yet")
    }
    if (this.model === "OpenAI") {
      const req = {
        prompt: prompt,
        image: Base64.decode(this.lastImageB64),
        n: 1,
        model: "gpt-image-2",
        quality: "low",
        size: "1024x1024"
      } as OpenAITypes.ImageEdits.Request
      return OpenAI.imagesEdit(req).then((result) => {
        const b64 = result.data[0]?.b64_json
        if (!b64) {
          throw "The edit returned no image"
        }
        return this.decode(b64, "image/png")
      })
    }
    return this.generateWithGemini(prompt, {mimeType: this.lastImageMime, data: this.lastImageB64})
  }

  /** Decodes base64 to a loaded texture and remembers it as the image to edit next. */
  private decode(b64: string, mime: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      Base64.decodeTextureAsync(
        b64,
        (texture) => {
          this.lastImageB64 = b64
          this.lastImageMime = mime
          texture.control
            .ensureLoaded()
            .then(() => resolve(texture))
            .catch(() => reject("Failure to load the decoded texture"))
        },
        () => reject("Failed to decode texture from base64 data.")
      )
    })
  }

  private generateWithGemini(prompt: string, inputImage?: {mimeType: string; data: string}): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const parts: any[] = inputImage ? [{inlineData: inputImage}, {text: prompt}] : [{text: prompt}]
      const request: GeminiTypes.Models.GenerateContentRequest = {
        model: "gemini-3.1-flash-image",
        type: "generateContent",
        body: {
          contents: [
            {
              parts: parts,
              role: "user"
            }
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        }
      }

      Gemini.models(request)
        .then((response) => {
          if (!response.candidates || response.candidates.length === 0) {
            reject("No image generated in response")
            return
          }

          let foundImage = false
          for (const part of response.candidates[0].content.parts) {
            if (part?.inlineData) {
              foundImage = true
              this.decode(part.inlineData.data, part.inlineData.mimeType || "image/png").then(resolve, reject)
              break
            }
          }

          if (!foundImage) {
            reject("No image data found in response")
          }
        })
        .catch((error) => {
          reject("Error while generating image: " + error)
        })
    })
  }

  private generateWithOpenAI(prompt: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const req = {
        prompt: prompt,
        n: 1,
        // gpt-image-2 is OpenAI's latest GPT Image model. It always returns
        // base64 (b64_json) — there is no url field — so the b64 branch below
        // is the path that fires. "low" quality keeps generation fast for the
        // interactive lens; bump to "medium"/"high" for final-asset quality.
        model: "gpt-image-2",
        quality: "low",
        size: "1024x1024"
      } as OpenAITypes.ImageGenerate.Request
      OpenAI.imagesGenerate(req)
        .then((result) => {
          result.data.forEach((datum) => {
            const b64 = datum.b64_json
            const url = datum.url
            if (url) {
              if (this.logger) this.logger.info("Texture loaded as image URL")
              const internetModule = require("LensStudio:InternetModule") as InternetModule
              const request = RemoteServiceHttpRequest.create()
              request.url = url
              Promisfy.InternetModule.performHttpRequest(internetModule, request).then((response) => {
                const resource = response.asResource()
                this.rmm.loadResourceAsImageTexture(
                  resource,
                  (texture) => {
                    // loadResourceAsImageTexture only downloads the texture — its provider is
                    // still unloaded, and would be loaded synchronously mid-render the first
                    // time the texture is drawn. ensureLoaded() moves that work off the render
                    // path. Requires Lens Scripting 370+ (this project is on 372).
                    texture.control
                      .ensureLoaded()
                      .then(() => resolve(texture))
                      .catch(() => reject("Failure to load texture from URL"))
                  },
                  () => {
                    reject("Failure to download texture from URL")
                  }
                )
              })
            } else if (b64) {
              if (this.logger) this.logger.debug("Decoding texture from base64")
              this.lastImageB64 = b64
              this.lastImageMime = "image/png"
              Base64.decodeTextureAsync(
                b64,
                (texture) => {
                  // Same as the URL branch above: decoding produces the Texture but leaves its
                  // provider unloaded until first draw. This is the branch gpt-image-2 actually
                  // takes, since it always returns b64_json.
                  texture.control
                    .ensureLoaded()
                    .then(() => resolve(texture))
                    .catch(() => reject("Failure to load texture from base64"))
                },
                () => {
                  reject("Failure to download texture from base64")
                }
              )
            }
          })
        })
        .catch((error) => reject(error))
    })
  }
}
