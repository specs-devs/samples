import StateMachine from "SpectaclesInteractionKit.lspkg/Utils/StateMachine";

export type CaptureSignals =
  | "TRIGGER_GESTURE"
  | "GESTURE_STARTED"
  | "GESTURE_COMPLETED"
  | "GESTURE_CANCELED"
  | "CAPTURE_REQUESTED"
  | "RESET"
  | "CLOSE";

export type CaptureStateName = "Idle" | "Gesturing" | "Captured" | "Closing";

export interface CaptureStateEffects {
  onEnterIdle: () => void;
  onEnterGesturing: () => void;
  onEnterCaptured: () => void;
  onEnterClosing: () => void;
  onStateChanged?: (state: CaptureStateName) => void;
}

export class CaptureStateMachine {
  private sm: StateMachine;
  private effects: CaptureStateEffects;

  constructor(effects: CaptureStateEffects) {
    this.effects = effects;
    this.sm = new StateMachine("Capture");

    this.addStates();
    this.sm.enterState("Idle", true);
  }

  private addStates() {
    this.sm.addState({
      name: "Idle",
      onEnter: () => {
        this.effects.onEnterIdle();
        this.effects.onStateChanged && this.effects.onStateChanged("Idle");
      },
      transitions: [
        {
          nextStateName: "Gesturing",
          checkOnSignal: (signal) => signal === "TRIGGER_GESTURE" || signal === "GESTURE_STARTED"
        },
        {
          nextStateName: "Closing",
          checkOnSignal: (signal) => signal === "CLOSE"
        }
      ]
    });

    this.sm.addState({
      name: "Gesturing",
      onEnter: () => {
        this.effects.onEnterGesturing();
        this.effects.onStateChanged && this.effects.onStateChanged("Gesturing");
      },
      transitions: [
        {
          nextStateName: "Captured",
          checkOnSignal: (signal) => signal === "GESTURE_COMPLETED" || signal === "CAPTURE_REQUESTED"
        },
        {
          nextStateName: "Closing",
          checkOnSignal: (signal) => signal === "GESTURE_CANCELED"
        },
        {
          nextStateName: "Idle",
          checkOnSignal: (signal) => signal === "RESET"
        },
        {
          nextStateName: "Closing",
          checkOnSignal: (signal) => signal === "CLOSE"
        }
      ]
    });

    this.sm.addState({
      name: "Captured",
      onEnter: () => {
        this.effects.onEnterCaptured();
        this.effects.onStateChanged && this.effects.onStateChanged("Captured");
      },
      transitions: [
        {
          nextStateName: "Idle",
          checkOnSignal: (signal) => signal === "RESET"
        },
        {
          nextStateName: "Gesturing",
          checkOnSignal: (signal) => signal === "TRIGGER_GESTURE" || signal === "GESTURE_STARTED"
        },
        {
          nextStateName: "Closing",
          checkOnSignal: (signal) => signal === "CLOSE"
        }
      ]
    });

    this.sm.addState({
      name: "Closing",
      onEnter: () => {
        this.effects.onEnterClosing();
        this.effects.onStateChanged && this.effects.onStateChanged("Closing");
      },
      transitions: [
        {
          nextStateName: "Idle",
          checkOnSignal: (signal) => signal === "RESET"
        }
      ]
    });
  }

  public send(signal: CaptureSignals, data?: unknown) {
    this.sm.sendSignal(signal, data);
  }

  public enter(state: CaptureStateName) {
    this.sm.enterState(state);
  }

  public getCurrentState(): CaptureStateName | null {
    const cs = this.sm.currentState;
    return cs ? (cs.name as CaptureStateName) : null;
  }
}
