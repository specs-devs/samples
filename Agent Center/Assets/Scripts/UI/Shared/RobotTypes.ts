import { AgentStatus } from "../../Types";

export type RobotState =
  | "idle"
  | "listening"
  | "thinking"
  | "tool_call"
  | "ignoring"
  | "sleeping"
  | "error"
  | "deactivated"
  | "connecting"
  | "awaiting_action";

export type RobotTheme =
  | "cat"
  | "owl"
  | "ghost"
  | "axolotl"
  | "crt"
  | "robot";

export const STATUS_TO_ROBOT_STATE: Record<AgentStatus, RobotState> = {
  [AgentStatus.Idle]: "idle",
  [AgentStatus.Working]: "tool_call",
  [AgentStatus.Error]: "error",
  [AgentStatus.Offline]: "sleeping",
  [AgentStatus.Sleeping]: "sleeping",
  [AgentStatus.Deactivated]: "deactivated",
  [AgentStatus.Connecting]: "connecting",
  [AgentStatus.AwaitingAction]: "awaiting_action",
};

export const TOPIC_STATUS_TO_ROBOT_STATE: Record<string, RobotState> = {
  CREATING: "tool_call",
  RUNNING: "tool_call",
  FINISHED: "idle",
  STOPPED: "sleeping",
  ERROR: "error",
  AWAITING_ACTION: "awaiting_action",
};

export function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
