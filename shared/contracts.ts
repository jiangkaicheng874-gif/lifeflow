export interface CalendarEvent {
  id: string;
  ownerId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  location: string;
  notes: string;
}
export interface EventDraft {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  notes?: string;
}
export interface Health {
  status: "ok";
  storage: "sqlite";
  assistant: "not-integrated";
}

export interface TimeBlock {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}
export interface CalendarPreferences {
  timeBlocks: TimeBlock[];
  version: number;
  semesterStart: string | null;
}

export interface CourseCandidate {
  id: string;
  title: string;
  courseCode: string;
  weekday: number;
  firstPeriod: number;
  lastPeriod: number;
  weeks: number[];
  weekText: string;
  teacher: string;
  location: string;
  sourceCell: string;
  needsPeriodReview: boolean;
}
export interface CourseSheet {
  school: string;
  termLabel: string;
  courses: CourseCandidate[];
  warnings: string[];
  unscheduled: string[];
  courseCellCount: number;
}
export interface CoursePreview extends CourseSheet {
  previewId: string;
  preferencesVersion: number;
}
export interface CourseSelection {
  candidateId: string;
  firstPeriod: number;
  lastPeriod: number;
  periodConfirmed: boolean;
}
export interface CoursePlanInput {
  previewId: string;
  preferencesVersion: number;
  selections: CourseSelection[];
}
export interface CoursePlanItem {
  candidateId: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  status: "new" | "duplicate" | "conflict";
  reason: string;
}
export interface CoursePlan {
  digest: string;
  items: CoursePlanItem[];
  counts: { added: number; duplicates: number; conflicts: number };
}
export interface CourseImportResult {
  added: number;
  duplicates: number;
  conflicts: number;
}
