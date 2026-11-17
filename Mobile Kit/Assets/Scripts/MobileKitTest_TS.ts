/**
 * SPECS Inc. 2027
 * Mobile Test TS component for the Mobile Kit lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent } from "SnapDecorators.lspkg/decorators";

// Lines kept on the on-screen log below its title.
const LOG_LINES = 9

@component
export class MobileTest_TS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MobileTest_TS – Mobile Kit test scene</span><br/><span style="color: #94A3B8; font-size: 11px;">Tests BLE session, request-response, subscriptions, and remote asset loading.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Session</span>')
  @input
  @hint("Automatically close the session after a 10 second delay")
  resetAfterDelay: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scene References</span>')
  @input
  @hint("Image used to display the remote texture asset")
  image: Image

  @input
  @hint("Container SceneObject for the instantiated GLTF mesh")
  gltfContainer: SceneObject

  @input
  @hint("Material applied to the instantiated GLTF asset")
  gltfMaterial: Material

  @input
  @hint("Text component used to display connection and data logs on screen")
  logText: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private module = require("LensStudio:SpectaclesMobileKitModule")
  private internetModule: InternetModule = require("LensStudio:InternetModule")

  private mainPass: Pass
  private session: any = null
  // Each test run gets a number, so callbacks of a stopped run are ignored.
  private run = 0
  private started = false
  private initialLogText = ""

  private appendLine(txt: string) {
    this.logger.info(txt)
    if (this.logText) {
      // Keep the title and only the newest lines, so the log never grows over the rest of the Lens.
      const lines = this.logText.text.split("\n")
      lines.push(txt)
      this.logText.text = [lines[0]].concat(lines.slice(1).slice(-LOG_LINES)).join("\n")
    }
  }

  private async createSessionAsync(onDisconnect: () => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const session = this.module.createSession()
      // Kept right away so stopSession() can also close a session that hasn't connected yet.
      this.session = session
      session.onDisconnected.add(onDisconnect)
      session.onConnected.add(() => {
        resolve(session)
      })
      session.start()
    })
  }

  onAwake(): void {
    this.logger = new Logger("MobileTest_TS", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    // Only one of the TS / JS versions runs at a time: when this one is turned off its session is
    // closed, and when it is turned on again the test starts over.
    this.createEvent("OnDisableEvent").bind(() => this.stopSession())
    this.createEvent("OnEnableEvent").bind(() => {
      if (this.started) {
        this.runTest()
      }
    })
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()");
    this.image.mainMaterial = this.image.mainMaterial.clone()
    this.mainPass = this.image.mainPass
    // The log's first line is its title; appendLine() adds everything after it.
    this.initialLogText = this.logText ? this.logText.text.split("\n")[0] : ""
    this.started = true
    this.runTest()
  }

  private stopSession(): void {
    this.run += 1
    if (this.session) {
      this.logger.info("Stopping the session")
      this.session.close()
      this.session = null
    }
  }

  private async runTest(): Promise<void> {
    this.stopSession()
    const run = this.run
    const live = () => run === this.run
    if (this.logText) {
      this.logText.text = this.initialLogText
    }
    // A mesh left by an earlier run would pile up under the new one.
    for (let i = this.gltfContainer.getChildrenCount() - 1; i >= 0; i--) {
      this.gltfContainer.getChild(i).destroy()
    }

    this.appendLine("Script Started")
    try {
      this.appendLine("Awaiting connection")

      if (this.resetAfterDelay) {
        const delay = this.createEvent("DelayedCallbackEvent")
        delay.bind(() => {
          if (live()) {
            this.appendLine("Stopping the session")
            this.stopSession()
          }
        })
        delay.reset(10)
      }

      const session = await this.createSessionAsync(() => {
        if (live()) {
          this.appendLine("Disconnected")
          // Start over shortly after the phone disconnects, so the Lens reconnects when it comes back.
          const delay = this.createEvent("DelayedCallbackEvent")
          delay.bind(() => {
            if (live()) {
              this.runTest()
            }
          })
          delay.reset(1)
        }
      })
      if (!live()) {
        return
      }

      this.appendLine("Client Connected")

      // oneway, not expecting a response
      session.sendData("test data")
      this.appendLine("Sent data")

      // request-app-digest
      // This "app://digest" request is not sent to the mobile app for processing.
      // It is called to get the digest of the connected mobile app,
      // allowing the Lens to determine whether the connected app is trustworthy.
      try {
        const response = await session.sendRequest("app://digest")
        if (!live()) return
        this.appendLine(`Digest: ${response}`)
      } catch (error) {
        if (!live()) return
        this.appendLine(`Error: ${error}`)
      }

      // request-response
      try {
        const response = await session.sendRequest("echo me back")
        if (!live()) return
        this.appendLine(`Response: ${response}`)
      } catch (error) {
        if (!live()) return
        this.appendLine(`Error: ${error}`)
      }

      if (!live()) {
        return
      }

      // subscribe to a topic
      const subscription = session.startSubscription("hello world times", (error) => {
        this.appendLine(`Subscription error: ${error}`)
      })
      subscription.add((response) => {
        this.appendLine(`Subscription response: ${response}`)
      })

      const textureId = "spectacleskit://test.png"
      const textureResource: DynamicResource = this.internetModule.makeResourceFromUrl(textureId)
      this.appendLine(`Loading asset: ${textureId}`)
      const remoteMediaModule: RemoteMediaModule = require("LensStudio:RemoteMediaModule")
      remoteMediaModule.loadResourceAsImageTexture(
        textureResource,
        (texture) => {
          if (!live()) return
          this.appendLine("Texture downloaded")
          // Downloading only fetches the bytes. The texture's provider is still unloaded and
          // would be loaded synchronously mid-render on first draw, so await ensureLoaded()
          // before assigning it. Requires Lens Scripting 370+ (this project is on 372).
          texture.control
            .ensureLoaded()
            .then(() => {
              if (!live()) return
              this.appendLine("Texture loaded")
              this.mainPass.baseTex = texture
            })
            .catch((error) => {
              this.appendLine(`Error loading texture: ${error}`)
            })
        },
        (error) => {
          this.appendLine(`Error loading asset: ${error}`)
        }
      )
      const meshId = "spectacleskit://test.glb"
      const meshResource: DynamicResource = this.internetModule.makeResourceFromUrl(meshId)
      this.appendLine(`Loading asset: ${meshId}`)
      remoteMediaModule.loadResourceAsGltfAsset(
        meshResource,
        (asset) => {
          if (!live()) return
          this.appendLine("Mesh loaded")
          asset.tryInstantiate(this.gltfContainer, this.gltfMaterial)
          // TODO: you can now find a new object in this.gltfContainer and change its textures
        },
        (error) => {
          this.appendLine(`Error loading asset: ${error}`)
        }
      )

      // try other asset types:
      // remoteMediaModule.loadAsAnimatedTexture('spectacleskit://test_asset.gif', ( texture )=> {
      // remoteMediaModule.loadAsVideoTexture('spectacleskit://test_asset.webp', ( texture )=> {
      // remoteMediaModule.loadAsAudioTrackAsset('spectacleskit://test_asset.wav', ( asset )=> {

      // downloadAsset wouldn't work
      // it only supports assets compressed with our proprietary format
      // script.asset.downloadAsset(( asset )=> {

      // stop the subscription
      // session.stopSubscription(subscription)
    } catch (error) {
      this.appendLine(`Mobile Kit is not available: ${error}`)
    }
  }
}
