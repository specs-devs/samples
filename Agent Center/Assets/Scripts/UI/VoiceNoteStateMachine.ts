import StateMachine from "SpectaclesInteractionKit.lspkg/Utils/StateMachine";

export type VoiceNoteSignal =
  | "PALM_FACING"
  | "PALM_AWAY"
  | "PINCH_DOWN"
  | "PINCH_UP"
  | "TRANSCRIPT_FINAL"
  | "ASR_ERROR"
  | "HAND_LOST"
  | "SEND_SELECTED"
  | "CANCEL_SEND"
  | "DISMISS_TIMEOUT";

export type VoiceNoteStateName = "Idle" | "Ready" | "Recording" | "SendTo";

export interface VoiceNoteStateEffects {
  onEnterIdle: () => void;
  onEnterReady: () => void;
  onEnterRecording: () => void;
  onExitRecording: () => void;
  onEnterSendTo: () => void;
  onExitSendTo: () => void;
}

export class VoiceNoteStateMachine {
  private sm: StateMachine;

  constructor(effects: VoiceNoteStateEffects) {
    this.sm = new StateMachine("VoiceNote");

    this.sm.addState({
      name: "Idle",
      onEnter: () => effects.onEnterIdle(),
      transitions: [
        {
          nextStateName: "Ready",
          checkOnSignal: (signal: string) => signal === "PALM_FACING",
        },
      ],
    });

    this.sm.addState({
      name: "Ready",
      onEnter: () => effects.onEnterReady(),
      transitions: [
        {
          nextStateName: "Idle",
          checkOnSignal: (signal: string) =>
            signal === "PALM_AWAY" || signal === "HAND_LOST",
        },
        {
          nextStateName: "Recording",
          checkOnSignal: (signal: string) => signal === "PINCH_DOWN",
        },
      ],
    });

    this.sm.addState({
      name: "Recording",
      onEnter: () => effects.onEnterRecording(),
      onExit: () => effects.onExitRecording(),
      transitions: [
        {
          nextStateName: "SendTo",
          checkOnSignal: (signal: string) => signal === "TRANSCRIPT_FINAL",
        },
        {
          nextStateName: "SendTo",
          checkOnSignal: (signal: string, data: { hasTranscript: boolean }) =>
            signal === "PINCH_UP" && data?.hasTranscript === true,
        },
        {
          nextStateName: "Ready",
          checkOnSignal: (signal: string, data: { hasTranscript: boolean }) =>
            signal === "PINCH_UP" && !data?.hasTranscript,
        },
        {
          nextStateName: "Idle",
          checkOnSignal: (signal: string) =>
            signal === "ASR_ERROR" || signal === "HAND_LOST",
        },
      ],
    });

    this.sm.addState({
      name: "SendTo",
      onEnter: () => effects.onEnterSendTo(),
      onExit: () => effects.onExitSendTo(),
      transitions: [
        {
          nextStateName: "Idle",
          checkOnSignal: (signal: string) =>
            signal === "SEND_SELECTED" ||
            signal === "CANCEL_SEND" ||
            signal === "DISMISS_TIMEOUT",
        },
      ],
    });

    this.sm.enterState("Idle", true);
  }

  send(signal: VoiceNoteSignal, data?: unknown): void {
    this.sm.sendSignal(signal, data);
  }

  getCurrentState(): VoiceNoteStateName | null {
    const cs = this.sm.currentState;
    return cs ? (cs.name as VoiceNoteStateName) : null;
  }
}
