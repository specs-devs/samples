/**
 * Specs Inc. 2026
 * Light Ai Input Manager handling core logic for the BLE Playground lens.
 */
import {ASRQueryController} from "Scripts/AI/ASRQueryController"
import {OpenAI} from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI"
import {RemoteServiceGatewayCredentials} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {reportError} from "Scripts/Helpers/ErrorUtils"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {LightAiEventListener} from "./LightAiEventListener"
import {LightAiJsonEventEmitter} from "./LightAiJsonEventEmitter"

@component
export class LightAiInputManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightAiInputManager – voice-to-AI light theme manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Converts a voice query into an OpenAI JSON keyframe sequence and dispatches it to light listeners.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("ASR query controller that provides transcribed voice queries")
  asrQueryController: ASRQueryController

  @input
  @hint("JSON event emitter that drives light keyframe animation from parsed AI data")
  lightAiJsonEventEmitter: LightAiJsonEventEmitter

  @input
  @hint("Remote Service Gateway credentials component providing the OpenAI token")
  remoteServiceGatewayCredentials: RemoteServiceGatewayCredentials

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  private logger: Logger
  private instructions: string
  private lightAiEventListeners: LightAiEventListener[]
  private aiLightDataCount: number
  private loopLength: number

  onAwake() {
    this.logger = new Logger("LightAiInputManager", this.enableLogging, true)
    this.lightAiEventListeners = []
    this.aiLightDataCount = 5
    this.loopLength = 5

    this.instructions = this.definePrompt()
  }

  @bindStartEvent
  onStart() {
    this.asrQueryController.onQueryEvent.add((query) => {
      this.makeRequest(query)
    })
  }

  // Called from RoomLightsUI
  onToggle(on: boolean) {
    if (on) {
      this.asrQueryController.show()
      if (
        this.remoteServiceGatewayCredentials.openAIToken.includes("[INSERT OPENAI TOKEN HERE]") ||
        this.remoteServiceGatewayCredentials.openAIToken === ""
      ) {
        this.logger.error("OpenAI token not set in RemoteServiceGatewayCredentials.")
        return
      } else {
        this.logger.info("AI input enabled — awaiting voice query.")
      }
    } else {
      this.asrQueryController.hide()
      this.lightAiJsonEventEmitter.stopAnimation()
    }
  }

  addListener(lightAiEventListener: LightAiEventListener) {
    this.lightAiEventListeners.push(lightAiEventListener)
  }

  private definePrompt() {
    const indexMax = this.aiLightDataCount - 1
    let str = "There are " + this.aiLightDataCount + " hue light bulbs. "
    str += "Return the color animation keyframes that match the theme the user requests in JSON format: "
    const jsonObj = {
      keyframes: [
        {
          lightIndex: 0, // Unique identifier
          brightness: 0.8, // From 0 to 1
          color: [0.5, 0.3, 0.7], // R,G,B from 0 to 1
          time: 0 // In seconds
        }
      ]
    }
    str += JSON.stringify(jsonObj)
    str += "The lightIndex should be from 0 to " + indexMax + ". "
    str += "Each light index should have 2-5 keyframes with a time in seconds from 0 to " + this.loopLength + ". "
    str += "Each light needs a keyframe to start at at second 0. "
    str += "Vary the timing and number of keyframes for each bulb -- all the keyframe times should be different. "
    str += "All of the colors should be complimentary and not the same. Use only colors that exactly match the theme. "
    str += "Use saturated or neon colors."
    str += "Return only json. Do not return any other text."
    return str
  }

  makeRequest(query: string) {
    if (
      this.remoteServiceGatewayCredentials.openAIToken.includes("[INSERT OPENAI TOKEN HERE]") ||
      this.remoteServiceGatewayCredentials.openAIToken === ""
    ) {
      return
    }
    this.logger.info("Request: " + query)
    OpenAI.chatCompletions({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: this.instructions
        },
        {
          role: "user",
          content: query
        }
      ],
      response_format: {
        type: "json_object"
      }
    })
      .then((response) => {
        this.logger.info("Response received for: " + query)
        this.cleanAndSendJson(response.choices[0].message.content)
      })
      .catch((error) => {
        reportError(error)
      })
  }

  private cleanAndSendJson(str: string) {
    if (str.startsWith("```json\n")) {
      str = str.substring("```json\n".length)
    }
    if (str.endsWith("```")) {
      str = str.substring(0, str.length - "```".length)
    }

    try {
      const jsonObj = JSON.parse(str)
      this.lightAiJsonEventEmitter.startAnimation(
        jsonObj,
        this.lightAiEventListeners,
        this.aiLightDataCount,
        this.loopLength
      )
    } catch (error) {
      reportError(error)
    }
  }
}
