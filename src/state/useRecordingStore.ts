import { create } from 'zustand';

export type UploadStatus = 'idle' | 'uploading' | 'completed' | 'failed';

export type UploadState = {
  status: UploadStatus;
  progress: number;
  fileName: string;
  error?: string;
};

export type RecordingState = {
  isRecording: boolean;
  setIsRecording: (isRecording: boolean) => void;
  isTabLocked: boolean;
  setIsTabLocked: (isTabLocked: boolean) => void;
  // Modal-based recording (bypasses react-navigation to avoid header event crashes)
  showRecordingModal: boolean;
  setShowRecordingModal: (show: boolean) => void;
  // Upload progress state
  upload: UploadState;
  setUploadProgress: (progress: number) => void;
  setUploadStatus: (status: UploadStatus, error?: string) => void;
  startUpload: (fileName: string) => void;
  clearUpload: () => void;
};

export const useRecordingStore = create<RecordingState>((set) => ({
  isRecording: false,
  setIsRecording: (isRecording) => set({ isRecording }),
  isTabLocked: false,
  setIsTabLocked: (isTabLocked) => set({ isTabLocked }),
  showRecordingModal: false,
  setShowRecordingModal: (show) => set({ showRecordingModal: show }),
  // Upload state
  upload: {
    status: 'idle',
    progress: 0,
    fileName: '',
  },
  setUploadProgress: (progress) =>
    set((state) => ({
      upload: { ...state.upload, progress },
    })),
  setUploadStatus: (status, error) =>
    set((state) => ({
      upload: { ...state.upload, status, error },
    })),
  startUpload: (fileName) =>
    set({
      upload: {
        status: 'uploading',
        progress: 0,
        fileName,
      },
    }),
  clearUpload: () =>
    set({
      upload: {
        status: 'idle',
        progress: 0,
        fileName: '',
      },
    }),
}));

