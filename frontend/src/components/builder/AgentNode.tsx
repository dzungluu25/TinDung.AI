import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Bot, Settings2, Database, CodeSquare } from "lucide-react";
import type { ModelRegistryEntry, WorkflowAgentType } from "../../types/workflow";
import styles from "./AgentNode.module.css";

export interface AgentNodeData {
  label: string;
  agentType: WorkflowAgentType;
  llm: string;
  knowledge: "none" | "faiss" | "graphrag";
  mcp: "none" | "credit" | "legal";
  modelOptions?: ModelRegistryEntry[];
  runStatus?: "running" | "success" | "needs_review" | "failed";
  onFieldChange?: (field: "llm" | "knowledge" | "mcp", value: string) => void;
  [key: string]: unknown;
}

const STATUS_STYLE: Record<string, string> = {
  running: styles.statusRunning,
  success: styles.statusSuccess,
  needs_review: styles.statusReview,
  failed: styles.statusFailed,
};

export const AgentNode = memo(({ data, isConnectable }: NodeProps) => {
  const nodeData = data as AgentNodeData;
  const modelOptions = nodeData.modelOptions ?? [];
  const statusClass = nodeData.runStatus ? STATUS_STYLE[nodeData.runStatus] : undefined;

  return (
    <div className={[styles.agentNode, statusClass].filter(Boolean).join(" ")}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className={styles.handle} />

      <div className={styles.header}>
        <Bot size={16} />
        <strong>{nodeData.label || "New Agent"}</strong>
        <span className={styles.badge}>{nodeData.agentType || "Sequential"}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <Settings2 size={12} />
          <select value={nodeData.llm} onChange={e => nodeData.onFieldChange?.("llm", e.target.value)}>
            {modelOptions.length === 0 && <option value="">Đang tải model...</option>}
            {modelOptions.map(model => (
              <option key={model.id} value={model.id} disabled={!model.configured}>
                {model.label}
                {!model.configured ? " (chưa cấu hình)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <Database size={12} />
          <select value={nodeData.knowledge} onChange={e => nodeData.onFieldChange?.("knowledge", e.target.value)}>
            <option value="none">No Knowledge</option>
            <option value="graphrag">GraphRAG (Neo4j)</option>
            <option value="faiss" disabled>
              FAISS VectorDB (chưa cấu hình)
            </option>
          </select>
        </div>

        <div className={styles.field}>
          <CodeSquare size={12} />
          <select value={nodeData.mcp} onChange={e => nodeData.onFieldChange?.("mcp", e.target.value)}>
            <option value="none">No MCP Tools</option>
            <option value="credit">Credit API MCP</option>
            <option value="legal" disabled>
              Legal Policy MCP (sắp có)
            </option>
          </select>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="a" isConnectable={isConnectable} className={styles.handle} />
      {(nodeData.agentType === "Semi-sequential" || nodeData.agentType === "Free") && (
        <Handle
          type="source"
          position={Position.Right}
          id="b"
          isConnectable={isConnectable}
          className={`${styles.handle} ${styles.conditionalHandle}`}
        />
      )}
    </div>
  );
});
