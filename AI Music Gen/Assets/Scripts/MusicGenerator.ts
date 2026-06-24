/**
 * Specs Inc. 2026
 * Music Generator component for the AI Music Gen Spectacles lens.
 */
import {GoogleGenAI} from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAI"
import {GoogleGenAITypes} from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes"
import {Lyria} from "RemoteServiceGateway.lspkg/HostedExternal/Lyria"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {MusicObject} from "./MusicObject"
import {SnapCloudRequirements} from "./SnapCloudRequirements"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class MusicGenerator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Music Generator – AI music generation pipeline</span><br/><span style="color: #94A3B8; font-size: 11px;">Combines user selections into a Lyria prompt and spawns MusicObject instances.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Scene object whose world position is used as the spawn point for new music objects")
  private _spawnPosition: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Snap Cloud</span>')
  @input
  @hint(
    "Generate music with Lyria 3 (MP3, fits under the 4MB RemoteApi limit) and save each track to Snap Cloud Storage. When off, uses the original inline Lyria-002 path whose ~8MB WAV response currently exceeds the limit."
  )
  private _useSnapCloud: boolean = true

  @input
  @hint("Reference to SnapCloudRequirements for centralized Supabase configuration")
  @allowUndefined
  private _snapCloudRequirements: SnapCloudRequirements

  @input
  @hint("Lyria 3 model id requested through the Remote Service Gateway Gemini endpoint")
  private _lyriaModel: string = "lyria-3-clip-preview"

  @input
  @hint("Supabase Storage bucket where generated tracks are saved (must exist)")
  private _storageBucket: string = "generated-music"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private _musicObjectPrefab: ObjectPrefab = requireAsset("../Prefabs/MusicObject.prefab") as ObjectPrefab
  private internetModule: InternetModule = require("LensStudio:InternetModule")
  private remoteMediaModule: RemoteMediaModule = require("LensStudio:RemoteMediaModule")
  private _supabaseClient: any = null

  onAwake() {
    this.logger = new Logger("MusicGenerator", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  public createMusicObject(genres: string[]) {
    this.combineGenresToPrompt(genres).then(({prompt, displayTitle}) => {
      const musicObject = this._musicObjectPrefab.instantiate(null)
      const musicObjController = musicObject.getComponent(MusicObject.getTypeName())
      musicObjController.setDisplayTitle(displayTitle)
      musicObjController.setPosition(this._spawnPosition.getTransform().getWorldPosition())
      this.logger.info("Lyria prompt: " + prompt)

      if (this._useSnapCloud) {
        this.generateViaSnapCloud(prompt, musicObjController)
      } else {
        this.generateViaRemoteServiceGateway(prompt, musicObjController)
      }
    })
  }

  /**
   * Generate music with Lyria 3 through the Remote Service Gateway's Gemini endpoint.
   * Lyria 3 Clip returns a 30s MP3 (~1MB base64), which fits under the 4MB RemoteApi
   * message limit that the Lyria-002 inline WAV (~8MB) exceeds. The MP3 is saved to
   * Snap Cloud Storage, then downloaded back as an AudioTrackAsset for playback
   * (there is no runtime API to build an AudioTrackAsset from raw bytes).
   */
  private async generateViaSnapCloud(prompt: string, musicObjController: MusicObject) {
    try {
      // 0. Sign in to Snap Cloud first: if credentials are missing (empty
      //    SupabaseProject asset - re-import via Window > Supabase), fail before
      //    spending a Lyria generation
      const supabase = await this.ensureSupabaseClient()

      // 1. Generate: Lyria 3 uses the same generateContent endpoint as Gemini,
      //    so the existing RSG module and Google token cover it
      const response = await GoogleGenAI.Gemini.models({
        model: this._lyriaModel,
        type: "generateContent",
        body: {
          contents: [
            {
              role: "user",
              parts: [{text: prompt}]
            }
          ],
          // Lyria 3 rejects the request with 400 INVALID_ARGUMENT unless the
          // audio modality is requested explicitly
          generationConfig: {responseModalities: ["AUDIO", "TEXT"]}
        }
      })

      const parts = response?.candidates?.[0]?.content?.parts || []
      let b64Audio: string = null
      for (const part of parts) {
        const inlineData = (part as any).inlineData
        if (inlineData && inlineData.data) {
          b64Audio = inlineData.data
          // Device playback debugging: SnapOS may not decode every container the
          // editor does, so record exactly what Lyria 3 hands back
          this.logger.info(`Lyria 3 audio mimeType: ${inlineData.mimeType || "(unspecified)"}`)
        } else if (part.text) {
          // Lyria 3 also returns lyrics / song structure as text parts
          this.logger.info("Lyria 3 description: " + part.text)
        }
      }
      if (!b64Audio) {
        throw new Error("No audio in Lyria 3 response: " + JSON.stringify(response).slice(0, 300))
      }

      // 2. Save the MP3 to Snap Cloud Storage (persists the track and lets us
      //    play it back as an AudioTrackAsset)
      const mp3Bytes = Base64.decode(b64Audio)
      this.logger.info(`Lyria 3 returned ${mp3Bytes.length} bytes of audio; uploading to storage`)
      const path = `music/track_${Date.now()}.mp3`
      let {error: uploadError} = await supabase.storage
        .from(this._storageBucket)
        .upload(path, mp3Bytes, {contentType: "audio/mpeg"})
      if (uploadError && /bucket not found/i.test(uploadError.message || "")) {
        this.logger.warn(`Bucket "${this._storageBucket}" not found - creating it`)
        const {error: createError} = await supabase.storage.createBucket(this._storageBucket, {
          public: true,
          allowedMimeTypes: ["audio/mpeg"]
        })
        if (createError) {
          throw new Error(
            `Bucket "${this._storageBucket}" does not exist and could not be created ` +
              `(${createError.message || JSON.stringify(createError)}). ` +
              `Create it in the Snap Cloud dashboard: Storage -> New bucket -> "${this._storageBucket}"`
          )
        }
        ;({error: uploadError} = await supabase.storage
          .from(this._storageBucket)
          .upload(path, mp3Bytes, {contentType: "audio/mpeg"}))
      }
      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message || JSON.stringify(uploadError)}`)
      }

      // 3. Transcode the MP3 to WAV with the Snap Cloud edge function. SnapOS cannot
      //    decode MP3 at runtime - the track plays but pushes zero samples into the
      //    audio graph (silent on device, fine in editor) - while WAV plays through the
      //    same RemoteMediaModule path. See SnapCloud/functions/transcode-to-wav.
      let playbackPath = path
      try {
        playbackPath = await this.transcodeToWav(path)
        this.logger.info(`Transcoded to ${playbackPath}`)
      } catch (transcodeError) {
        // Editor decodes MP3 fine, so keep working there; on device this means silence
        this.logger.warn(
          `transcode-to-wav failed (${transcodeError}) - playing the MP3 directly. ` +
            `Editor playback works; ON DEVICE THIS TRACK WILL BE SILENT until the edge function is deployed.`
        )
      }

      // 4. Get a URL for the track. Prefer the short public URL: SnapOS caches
      //    downloads under a filename derived from the full URL, and a signed URL's
      //    ~300-char JWT token exceeds the 255-byte filename limit on device
      //    (download fails with ENAMETOOLONG before any network request). This is why
      //    the bucket must be public: a private bucket would need a signed URL.
      const {data: pub} = supabase.storage.from(this._storageBucket).getPublicUrl(playbackPath)
      const audioUrl = pub ? pub.publicUrl : null
      if (!audioUrl) {
        throw new Error("Could not create a URL for the uploaded track")
      }

      // 5. Download as a playable asset via the media pipeline
      this.logger.info("Loading generated audio from storage URL")
      const audioAsset = await this.loadAudioTrackFromUrl(audioUrl)
      musicObjController.setAudioTrack(audioAsset)
    } catch (error) {
      this.logger.error(`${error}`)
      musicObjController.setDisplayTitle("Error generating, try something else")
      setTimeout(() => {
        musicObjController.closeObject()
      }, 1500)
    }
  }

  /**
   * Lazily create and authenticate the Supabase client (Snap Cloud sign-in).
   */
  private async ensureSupabaseClient(): Promise<any> {
    if (this._supabaseClient) {
      return this._supabaseClient
    }
    if (!this._snapCloudRequirements || !this._snapCloudRequirements.isConfigured()) {
      throw new Error("SnapCloudRequirements not configured - assign a Supabase Project")
    }
    const project = this._snapCloudRequirements.getSupabaseProject()
    const {createClient} = require("SupabaseClient.lspkg/supabase-snapcloud")
    const client = createClient(project.url, project.publicToken)
    const {error} = await client.auth.signInWithIdToken({provider: "snapchat", token: ""})
    if (error) {
      this.logger.warn("Snap Cloud sign-in failed (uploads may be rejected by bucket policies): " + JSON.stringify(error))
    }
    this._supabaseClient = client
    return client
  }

  /**
   * Ask the transcode-to-wav edge function to convert the uploaded MP3 to WAV.
   * Returns the storage path of the WAV. Throws if the function is not deployed
   * or the transcode fails (caller falls back to the MP3).
   */
  private async transcodeToWav(mp3Path: string): Promise<string> {
    const url = this._snapCloudRequirements.getFunctionsApiUrl() + "transcode-to-wav"
    const response = await this.internetModule.fetch(url, {
      method: "POST",
      headers: this._snapCloudRequirements.getSupabaseHeaders(),
      body: JSON.stringify({bucket: this._storageBucket, path: mp3Path})
    })
    const text = await response.text()
    let result: any = null
    try {
      result = JSON.parse(text)
    } catch (e) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
    }
    if (!response.ok || !result.wavPath) {
      throw new Error(result.error || `HTTP ${response.status}`)
    }
    return result.wavPath
  }

  /**
   * Download an audio file via the media pipeline (not subject to the RemoteApi message cap).
   */
  private loadAudioTrackFromUrl(url: string): Promise<AudioTrackAsset> {
    return new Promise((resolve, reject) => {
      // makeResourceFromUrl may not be in InternetModule types yet
      const resource = (this.internetModule as any).makeResourceFromUrl(url)
      if (!resource) {
        reject(new Error("Failed to create resource from audio URL"))
        return
      }
      this.remoteMediaModule.loadResourceAsAudioTrackAsset(
        resource,
        (audioAsset) => resolve(audioAsset),
        (error) => reject(new Error(`Failed to load audio track: ${error}`))
      )
    })
  }

  /**
   * Original path: inline Lyria request through the Remote Service Gateway.
   * Note: responses (~8MB base64 WAV) currently exceed the 4MB RemoteApi message limit
   * on device; keep this path for when the platform raises the limit.
   */
  private generateViaRemoteServiceGateway(prompt: string, musicObjController: MusicObject) {
    const musicRequest: GoogleGenAITypes.Lyria.LyriaRequest = {
      model: "lyria-002",
      type: "predict",
      body: {
        instances: [
          {
            prompt: prompt
          }
        ],
        parameters: {
          sample_count: 1
        }
      }
    }

    Lyria.performLyriaRequest(musicRequest)
      .then((response) => {
        // Check if response contains ALD verification failed error
        // Error might be in response.error.details or response.error.message
        if (response) {
          let hasAldError = false
          if (response.error) {
            const errorDetail = response.error.details || response.error.message || JSON.stringify(response.error)
            if (errorDetail && errorDetail.includes("ALD verification failed")) {
              hasAldError = true
            }
          }

          if (hasAldError) {
            this.logger.warn("ALD verification failed in response")
            musicObjController.setDisplayTitle("Please try again")
            setTimeout(() => {
              musicObjController.closeObject()
            }, 1500)
            return
          }
        }

        if (response && response.predictions && response.predictions.length) {
          const b64 = response.predictions[0].bytesBase64Encoded
          if (b64) {
            musicObjController.setB64Audio(b64)
          } else {
            // No audio data in response - use generic error
            musicObjController.setDisplayTitle("Error generating, try something else")
            setTimeout(() => {
              musicObjController.closeObject()
            }, 1500)
          }
        } else {
          // No predictions in response - use generic error
          musicObjController.setDisplayTitle("Error generating, try something else")
          setTimeout(() => {
            musicObjController.closeObject()
          }, 1500)
        }
      })
      .catch((error) => {
        this.logger.error(`${error}`)
        // Check if error specifically contains "ALD verification failed"
        // Error format might be: {"detail":"ALD verification failed."}
        const errorString = error?.toString() || JSON.stringify(error) || ""
        if (errorString.includes("ALD verification failed")) {
          musicObjController.setDisplayTitle("Please try again")
        } else {
          musicObjController.setDisplayTitle("Error generating, try something else")
        }
        setTimeout(() => {
          musicObjController.closeObject()
        }, 1500)
      })
  }

  private async combineGenresToPrompt(genres: string[]): Promise<{prompt: string; displayTitle: string}> {
    const systemInstruction: GoogleGenAITypes.Common.Content = {
      role: "system",
      parts: [
        {
          text: "You are composing best-practice prompts for the Lyria music generation model. Given a list of genres, write ONE cohesive, evocative, FAMILY-FRIENDLY prompt that: (1) clearly states genre/style, (2) sets mood/ambience, (3) specifies tempo feel (e.g., fast/slow), (4) describes rhythm/beat, (5) names a few key instruments, (6) hints at arrangement/progression, (7) mentions space/ambience (e.g., reverb), and (8) uses production-quality adjectives (e.g., warm, gritty, polished). Default to an instrumental track (no vocals) unless explicitly asked. Keep it to 1–2 sentences, vivid but concise. Also provide a displayTitle of at most 4 simple words capturing the vibe. Output strictly JSON per the provided schema."
        }
      ]
    }

    const userContent: GoogleGenAITypes.Common.Content = {
      role: "user",
      parts: [
        {
          text: `Combine these genres into one music prompt: ${genres.join(", ")}`
        }
      ]
    }

    const geminiRequest: GoogleGenAITypes.Gemini.Models.GenerateContentRequest = {
      model: "gemini-2.5-flash-lite",
      type: "generateContent",
      body: {
        systemInstruction,
        contents: [userContent],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              prompt: {
                type: "STRING",
                description: "A single, cohesive prompt text to feed to a music generator (e.g., Lyria)"
              },
              displayTitle: {
                type: "STRING",
                description: "A simple title (max 4 words) for UI display describing the combined vibe"
              }
            },
            required: ["prompt", "displayTitle"]
          },
          temperature: 0.6,
          topP: 0.9
        }
      }
    }

    const response = await GoogleGenAI.Gemini.models(geminiRequest)
    const text =
      response?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .filter((t) => !!t)
        .join("\n") || ""

    try {
      const json = JSON.parse(text)
      if (json && typeof json.prompt === "string" && typeof json.displayTitle === "string") {
        return {prompt: json.prompt, displayTitle: json.displayTitle}
      }
    } catch (e) {
      // fall through to return raw text
    }

    return {prompt: text, displayTitle: genres.slice(0, 4).join(" ")}
  }
}
