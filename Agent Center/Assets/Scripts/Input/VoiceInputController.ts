import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

export class VoiceInputController {
  private static _instance: VoiceInputController;

  private asrModule: AsrModule;
  private listening = false;

  public readonly onTranscript = new Event<string>();
  public readonly onPartialTranscript = new Event<string>();
  public readonly onError = new Event<AsrModule.AsrStatusCode>();

  public static getInstance(): VoiceInputController {
    if (!VoiceInputController._instance) {
      throw new Error(
        "VoiceInputController not initialized. Construct it before calling getInstance().",
      );
    }
    return VoiceInputController._instance;
  }

  constructor(asrModule: AsrModule) {
    this.asrModule = asrModule;
    VoiceInputController._instance = this;
  }

  startListening(): void {
    if (this.listening) return;
    this.listening = true;

    const options = AsrModule.AsrTranscriptionOptions.create();
    options.mode = AsrModule.AsrMode.HighAccuracy;
    options.silenceUntilTerminationMs = 2000;

    options.onTranscriptionUpdateEvent.add(
      (event: AsrModule.TranscriptionUpdateEvent) => {
        if (event.isFinal) {
          this.listening = false;
          this.asrModule.stopTranscribing();
          this.onTranscript.invoke(event.text);
        } else {
          this.onPartialTranscript.invoke(event.text);
        }
      },
    );

    options.onTranscriptionErrorEvent.add((code: AsrModule.AsrStatusCode) => {
      print(`[VoiceInput] ASR error: ${code}`);
      this.listening = false;
      this.asrModule.stopTranscribing();
      this.onError.invoke(code);
    });

    this.asrModule.startTranscribing(options);
    print("[VoiceInput] Started listening");
  }

  stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    this.asrModule.stopTranscribing();
    print("[VoiceInput] Stopped listening");
  }

  get isListening(): boolean {
    return this.listening;
  }
}
