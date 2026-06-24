/**
 * App-wide state definitions for the Spatial Anchors refresh.
 */

/** Screens available in the application UI flow. */
export enum AppScreen {
  GetStarted = "GetStarted",
  Capture = "Capture",
  InCapture = "InCapture",
  MyAreas = "MyAreas",
  InArea = "InArea",
}

/** High-level application states for the lifecycle state machine. */
export enum AppLifecycleState {
  Idle = "Idle",
  Initializing = "Initializing",
  Ready = "Ready",
  CapturingArea = "CapturingArea",
  Localizing = "Localizing",
  InArea = "InArea",
  Error = "Error",
}

/** Data describing a saved area/space. */
export interface AreaInfo {
  name: string
  id: string
}

/** Serialized widget data for persistence. */
export interface WidgetData {
  position: vec3
  rotation: vec3
  scale: vec3
  type: string
  content: string
}

/** Navigation event payload emitted via EventBus. */
export interface NavigationEvent {
  screen: AppScreen
  areaName?: string
}

/** Capture flow state transitions. */
export enum CaptureState {
  Idle = "Idle",
  Scanning = "Scanning",
  Complete = "Complete",
  TimedOut = "TimedOut",
  Cancelled = "Cancelled",
}
