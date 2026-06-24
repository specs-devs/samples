/**
 * Specs Inc. 2026
 * Chat GPT component for the Crop Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import {OpenAI} from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI"

@component
export class ChatGPT extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ChatGPT – sends captured image to OpenAI for identification</span><br/><span style="color: #94A3B8; font-size: 11px;">Encodes a texture as base64 and queries GPT-4o with vision capabilities to identify the cropped object.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private ImageQuality = CompressionQuality.HighQuality
  private ImageEncoding = EncodingType.Jpg

  onAwake() {
    this.logger = new Logger("ChatGPT", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  makeImageRequest(imageTex: Texture, callback) {
    this.logger.info("Making image request...")
    Base64.encodeTextureAsync(
      imageTex,
      (base64String) => {
        this.logger.info("Image encode Success!")
        const textQuery = "Identify in as much detail what object is in the image but only use a maxiumum of 5 words"
        this.sendGPTChat(textQuery, base64String, callback)
      },
      () => {
        this.logger.error("Image encoding failed!")
      },
      this.ImageQuality,
      this.ImageEncoding
    )
  }

  async sendGPTChat(request: string, image64: string, callback: (response: string) => void) {
    OpenAI.chatCompletions({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {type: "text", text: request},
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,` + image64
              }
            }
          ]
        }
      ],
      max_tokens: 50
    })
      .then((response) => {
        if (response.choices && response.choices.length > 0) {
          callback(response.choices[0].message.content)
          this.logger.info("Response from OpenAI: " + response.choices[0].message.content)
        }
      })
      .catch((error) => {
        this.logger.error("Error in OpenAI request: " + error)
      })
  }
}
