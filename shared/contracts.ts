export interface CalendarEvent {
  id: string;
  ownerId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface EventDraft {
  title: string;
  startsAt: string;
  endsAt: string;
}
export interface Health {
  status: "ok";
  storage: "sqlite";
  assistant: "not-integrated";
}
