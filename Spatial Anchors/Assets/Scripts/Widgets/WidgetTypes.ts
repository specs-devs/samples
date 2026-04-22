import {WidgetBase} from "./WidgetBase"

export enum WidgetType {
  Note = "note",
  Watch = "watch",
  Photo = "photo",
}

export interface WidgetTypeEntry {
  componentName: string
  displayName: string
}

export const WidgetTypeRegistry: Record<WidgetType, WidgetTypeEntry> = {
  [WidgetType.Note]: {
    componentName: "NoteWidget",
    displayName: "Note Widget",
  },
  [WidgetType.Watch]: {
    componentName: "WatchWidget",
    displayName: "Watch Widget",
  },
  [WidgetType.Photo]: {
    componentName: "PhotoWidget",
    displayName: "Photo Widget",
  },
}

export function getWidgetTypes(): WidgetType[] {
  return [WidgetType.Note, WidgetType.Watch, WidgetType.Photo]
}
