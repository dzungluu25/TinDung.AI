import { randomUUID } from "crypto";
import { pgQuery } from "../../config/pg";
import { supabase } from "../../config/supabase";
import { WorkflowDefinition, WorkflowEdge, WorkflowNode, WorkflowSettings } from "../../types/workflow.types";

interface WorkflowRow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const mapRow = (row: WorkflowRow): WorkflowDefinition => ({
  id: row.id,
  name: row.name,
  nodes: row.nodes,
  edges: row.edges,
  settings: row.settings,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const usingSupabase = (): boolean => Boolean(process.env.SUPABASE_DB_URL);

export const listWorkflows = async (): Promise<WorkflowDefinition[]> => {
  if (usingSupabase()) {
    const { data, error } = await supabase.from("workflow_definitions").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data as WorkflowRow[]).map(mapRow);
  }
  const result = await pgQuery("SELECT * FROM workflow_definitions ORDER BY updated_at DESC");
  return result.rows.map(mapRow);
};

export const getWorkflow = async (id: string): Promise<WorkflowDefinition | undefined> => {
  if (usingSupabase()) {
    const { data, error } = await supabase.from("workflow_definitions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as WorkflowRow) : undefined;
  }
  const result = await pgQuery("SELECT * FROM workflow_definitions WHERE id = $1", [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
};

export const saveWorkflow = async (input: {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  createdBy: string;
}): Promise<WorkflowDefinition> => {
  const id = randomUUID();
  const now = new Date().toISOString();
  const row: WorkflowRow = {
    id,
    name: input.name,
    nodes: input.nodes,
    edges: input.edges,
    settings: input.settings,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
  };

  if (usingSupabase()) {
    const { error } = await supabase.from("workflow_definitions").insert(row);
    if (error) throw error;
  } else {
    await pgQuery(
      `INSERT INTO workflow_definitions (id, name, nodes, edges, settings, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, row.name, JSON.stringify(row.nodes), JSON.stringify(row.edges), JSON.stringify(row.settings), row.created_by, now, now]
    );
  }
  return mapRow(row);
};

export const updateWorkflow = async (
  id: string,
  patch: { name?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[]; settings?: WorkflowSettings }
): Promise<WorkflowDefinition | undefined> => {
  const existing = await getWorkflow(id);
  if (!existing) return undefined;

  const updated: WorkflowDefinition = {
    ...existing,
    name: patch.name ?? existing.name,
    nodes: patch.nodes ?? existing.nodes,
    edges: patch.edges ?? existing.edges,
    settings: patch.settings ?? existing.settings,
    updatedAt: new Date().toISOString(),
  };

  if (usingSupabase()) {
    const { error } = await supabase
      .from("workflow_definitions")
      .update({ name: updated.name, nodes: updated.nodes, edges: updated.edges, settings: updated.settings, updated_at: updated.updatedAt })
      .eq("id", id);
    if (error) throw error;
  } else {
    await pgQuery(
      `UPDATE workflow_definitions SET name = $2, nodes = $3, edges = $4, settings = $5, updated_at = $6 WHERE id = $1`,
      [id, updated.name, JSON.stringify(updated.nodes), JSON.stringify(updated.edges), JSON.stringify(updated.settings), updated.updatedAt]
    );
  }
  return updated;
};

export const deleteWorkflow = async (id: string): Promise<boolean> => {
  if (usingSupabase()) {
    const { error, count } = await supabase.from("workflow_definitions").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    return Boolean(count);
  }
  const result = await pgQuery("DELETE FROM workflow_definitions WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
};
