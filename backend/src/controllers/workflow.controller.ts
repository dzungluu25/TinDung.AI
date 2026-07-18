import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  listWorkflows,
  getWorkflow,
  saveWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from "../services/data/workflow-definition.repository";
import { getModelRegistry } from "../config/model-registry";
import { runWorkflow } from "../services/orchestration/custom-workflow-engine";
import { WorkflowRunEvent, WorkflowSettings } from "../types/workflow.types";

const DEFAULT_SETTINGS: WorkflowSettings = { temperature: 0.2, maxTokens: 2000, hardnessEnabled: true };

export const getModelRegistryHandler = async (_req: AuthenticatedRequest, res: Response) =>
  res.status(200).json({ models: getModelRegistry() });

export const listWorkflowsHandler = async (_req: AuthenticatedRequest, res: Response) => {
  const workflows = await listWorkflows();
  return res.status(200).json({ workflows });
};

export const getWorkflowHandler = async (req: AuthenticatedRequest, res: Response) => {
  const workflow = await getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });
  return res.status(200).json(workflow);
};

export const createWorkflowHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { name, nodes, edges, settings } = req.body as {
    name?: string;
    nodes?: unknown[];
    edges?: unknown[];
    settings?: Partial<WorkflowSettings>;
  };
  if (typeof name !== "string" || !name.trim() || !Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({ error: "name, nodes[] and edges[] are required" });
  }

  const workflow = await saveWorkflow({
    name,
    nodes: nodes as never,
    edges: edges as never,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    createdBy: req.user!.sub,
  });
  return res.status(201).json(workflow);
};

export const updateWorkflowHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { name, nodes, edges, settings } = req.body as {
    name?: string;
    nodes?: unknown[];
    edges?: unknown[];
    settings?: Partial<WorkflowSettings>;
  };

  const existing = await getWorkflow(req.params.id);
  if (!existing) return res.status(404).json({ error: "Workflow not found" });

  const updated = await updateWorkflow(req.params.id, {
    name,
    nodes: nodes as never,
    edges: edges as never,
    settings: settings ? { ...existing.settings, ...settings } : undefined,
  });
  return res.status(200).json(updated);
};

export const deleteWorkflowHandler = async (req: AuthenticatedRequest, res: Response) => {
  const deleted = await deleteWorkflow(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Workflow not found" });
  return res.status(204).send();
};

export const runWorkflowStreamHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { input, caseId } = req.body as { input?: string; caseId?: string };
  if (typeof input !== "string" || !input.trim()) {
    return res.status(400).json({ error: "input is required" });
  }

  const workflow = await getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: "Workflow not found" });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const writeEvent = (event: WorkflowRunEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    await runWorkflow(workflow, input, caseId, writeEvent);
  } catch (error) {
    // Covers both validation errors (e.g. no valid entry node) and LangGraph's own
    // recursion-limit error as the ultimate backstop behind the engine's stepCount cap.
    writeEvent({ type: "error", message: error instanceof Error ? error.message : "Internal error while running workflow." });
  } finally {
    res.end();
  }
};
