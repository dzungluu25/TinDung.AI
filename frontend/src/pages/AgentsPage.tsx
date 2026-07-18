import { Activity, Braces, GitBranch, ShieldCheck } from "lucide-react";
import { Header } from "../layouts/Header";
import { OrchestrationGraph } from "../features/agent-trace/OrchestrationGraph";
import { AgentTimeline } from "../features/agent-trace/AgentTimeline";
import { useOrchestrationStore } from "../store/orchestrationStore";
import styles from "./AgentsPage.module.css";

export const AgentsPage = () => {
  const phase = useOrchestrationStore(s => s.phase);
  const steps = useOrchestrationStore(s => s.steps);
  const riskTier = useOrchestrationStore(s => s.riskTier);

  return (
    <>
      <Header eyebrow="Orchestration observability" title="Theo dõi workflow của Agent" subtitle="Quan sát state graph, tool calls và bằng chứng được tạo trong toàn bộ phiên thẩm định." />
      <div className={styles.stats}>
        <div><Activity size={17} /><span><small>Trạng thái</small><strong>{phase === "running" ? "Đang chạy" : phase === "done" ? "Hoàn tất" : "Sẵn sàng"}</strong></span></div>
        <div><GitBranch size={17} /><span><small>Risk lane</small><strong>{riskTier ?? "Chưa phân loại"}</strong></span></div>
        <div><Braces size={17} /><span><small>Agent steps</small><strong>{steps.filter(step => step.status === "done").length} / {steps.length || "—"}</strong></span></div>
        <div><ShieldCheck size={17} /><span><small>Traceability</small><strong>Enabled</strong></span></div>
      </div>
      <div className={styles.layout}>
        <OrchestrationGraph />
        <AgentTimeline />
      </div>
    </>
  );
};
