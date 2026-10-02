export type ScriptFontSize = "small" | "medium" | "large";

export type PresentationSlide = {
  id: string;
  page: number;
  title: string;
  durationSeconds: number;
  paragraphs: string[];
  speakerNotes?: string[];
};

export type PresentationScript = {
  id: string;
  title: string;
  locale: string;
  defaultDurationSeconds: number;
  slides: PresentationSlide[];
};
