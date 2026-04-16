export type HandBox = {
  id: number;
  score?: number;
  box: { x: number; y: number; width: number; height: number };
};

export type HandDetectorState =
  | { status: 'idle'; detections: HandBox[] }
  | { status: 'loading'; detections: HandBox[] }
  | { status: 'ready'; detections: HandBox[] }
  | { status: 'error'; detections: HandBox[]; error: string };

export type StartKeywordState =
  | { status: 'idle'; error?: string }
  | { status: 'loading'; error?: string }
  | { status: 'listening'; error?: string }
  | { status: 'error'; error: string };
