import { create } from 'zustand';
import type { BountyItem } from '../screens/components/bounties/BountyCard';

export type TaskState = {
  currentTask?: BountyItem;
  autoStart?: boolean;
  setTask: (task?: BountyItem, autoStart?: boolean) => void;
  setAutoStart: (autoStart: boolean) => void;
  clearTask: () => void;
};

export const useTaskStore = create<TaskState>((set) => ({
  currentTask: undefined,
  autoStart: false,
  setTask: (task, autoStart = false) => set({ currentTask: task, autoStart }),
  setAutoStart: (autoStart) => set({ autoStart }),
  clearTask: () => set({ currentTask: undefined, autoStart: false }),
}));
