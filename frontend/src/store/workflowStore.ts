import { create } from "zustand";
import type { WorkflowSettings } from "../types/workflow";

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = { temperature: 0.2, maxTokens: 2000, hardnessEnabled: true };

interface WorkflowStoreState {
  currentWorkflowId?: string;
  currentWorkflowName?: string;
  settings: WorkflowSettings;
  setCurrentWorkflow: (id: string | undefined, name?: string) => void;
  setSettings: (settings: WorkflowSettings) => void;
}

/**
 * Shared across `/builder` and `/settings` — the Settings page's temperature/maxTokens/
 * hardness controls apply to whichever workflow is currently open in the builder (no
 * separate global `runtime_settings` table for v1; settings live on the workflow
 * definition itself and are persisted via `updateWorkflow` when a workflow is open).
 */
export const useWorkflowStore = create<WorkflowStoreState>()(set => ({
  currentWorkflowId: undefined,
  currentWorkflowName: undefined,
  settings: DEFAULT_WORKFLOW_SETTINGS,
  setCurrentWorkflow: (id, name) => set({ currentWorkflowId: id, currentWorkflowName: name }),
  setSettings: settings => set({ settings }),
}));
