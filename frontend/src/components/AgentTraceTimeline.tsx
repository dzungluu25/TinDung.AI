import React from "react";
import type { AgentTrace } from "../types/trace.types";
import { ToolCallTable } from "./ToolCallTable";

interface AgentTraceTimelineProps {
  traces: AgentTrace[];
}

const AGENT_COLORS: Record<AgentTrace["agent"], { text: string; bg: string; icon: string; label: string }> = {
  planner: { text: "#3B82F6", bg: "rgba(59, 130, 246, 0.1)", icon: "P", label: "Planner Agent" },
  "customer-profile": { text: "#14B8A6", bg: "rgba(20, 184, 166, 0.1)", icon: "C", label: "Customer Profile" },
  credit: { text: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)", icon: "$", label: "Credit Specialist" },
  "product-policy": { text: "#8B5CF6", bg: "rgba(139, 92, 246, 0.1)", icon: "R", label: "Product Policy" },
  legal: { text: "#10B981", bg: "rgba(16, 185, 129, 0.1)", icon: "L", label: "Legal & Compliance" },
  risk: { text: "#F97316", bg: "rgba(249, 115, 22, 0.1)", icon: "D", label: "Risk Matrix" },
  operations: { text: "#EF4444", bg: "rgba(239, 68, 68, 0.1)", icon: "O", label: "Operations Specialist" },
  governance: { text: "#A3E635", bg: "rgba(163, 230, 53, 0.1)", icon: "G", label: "Governance & Audit" },
};

export const AgentTraceTimeline: React.FC<AgentTraceTimelineProps> = ({ traces }) => {
  if (traces.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: "23px",
          top: "16px",
          bottom: "16px",
          width: "2px",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          zIndex: 0,
        }}
      />

      {traces.map((trace) => {
        const styleInfo = AGENT_COLORS[trace.agent];

        return (
          <div key={trace.id} style={{ display: "flex", gap: "16px", zIndex: 1 }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: styleInfo.bg,
                border: `2px solid ${styleInfo.text}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: `0 0 10px ${styleInfo.bg}`,
              }}
            >
              {styleInfo.icon}
            </div>

            <div
              className="glass"
              style={{
                flexGrow: 1,
                padding: "16px",
                borderLeft: `4px solid ${styleInfo.text}`,
                backgroundColor: "rgba(22, 28, 45, 0.2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <h4 style={{ color: styleInfo.text, display: "inline-block", marginRight: "8px" }}>
                    {styleInfo.label}
                  </h4>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {new Date(trace.startedAt).toLocaleTimeString()}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "3px 8px",
                    borderRadius: "12px",
                    backgroundColor: trace.status === "blocked" ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.1)",
                    color: trace.status === "blocked" ? "var(--accent-red)" : "var(--accent-green)",
                    fontWeight: "600",
                  }}
                >
                  {trace.status.toUpperCase()}
                </span>
              </div>

              <p style={{ fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: "500" }}>
                Task: {trace.task}
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                {trace.summary}
              </p>

              <ToolCallTable toolCalls={trace.toolCalls} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

