import { useState } from "react";
import { Header } from "../layouts/Header";
import { Shield, SlidersHorizontal, Database } from "lucide-react";
import { useWorkflowStore } from "../store/workflowStore";
import { getDemoAccessToken } from "../services/authService";
import { updateWorkflow } from "../services/workflowService";
import { ApiError } from "../services/httpClient";
import styles from "./SettingsPage.module.css";

export const SettingsPage = () => {
  const currentWorkflowId = useWorkflowStore(s => s.currentWorkflowId);
  const currentWorkflowName = useWorkflowStore(s => s.currentWorkflowName);
  const settings = useWorkflowStore(s => s.settings);
  const setSettings = useWorkflowStore(s => s.setSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [banner, setBanner] = useState<string>();

  const handleSave = async () => {
    if (!currentWorkflowId) {
      setBanner("Chưa có workflow nào đang mở. Lưu hoặc tải một workflow ở /builder trước khi chỉnh thông số.");
      return;
    }
    setIsSaving(true);
    setBanner(undefined);
    try {
      const token = await getDemoAccessToken();
      await updateWorkflow(currentWorkflowId, { settings }, token);
      setBanner(`Đã lưu thông số cho "${currentWorkflowName}".`);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Lưu thông số thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header
        eyebrow="System Configuration"
        title="Bảng điều khiển & Thông số (Dashboard)"
        subtitle={
          currentWorkflowId
            ? `Đang chỉnh thông số cho workflow "${currentWorkflowName}".`
            : "Chưa có workflow nào đang mở — mở hoặc lưu một workflow ở Workflow Designer trước."
        }
      />

      <div className={styles.container}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <SlidersHorizontal size={18} />
            <h2>LLM Hyperparameters</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label>Temperature: {settings.temperature}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.temperature}
              onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
            />
            <small>Độ sáng tạo của model (0: Chính xác, 1: Sáng tạo).</small>
          </div>
          <div className={styles.fieldGroup}>
            <label>Max Tokens: {settings.maxTokens}</label>
            <input
              type="number"
              value={settings.maxTokens}
              onChange={e => setSettings({ ...settings, maxTokens: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Shield size={18} />
            <h2>Layer Hardness & Guardrails</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={settings.hardnessEnabled}
                onChange={e => setSettings({ ...settings, hardnessEnabled: e.target.checked })}
              />
              <span>Kích hoạt Auto-Retry (tự động gọi lại LLM nếu output sai schema hoặc thiếu citation)</span>
            </label>
            <small>
              Áp dụng cho mọi node LLM trong Workflow Designer qua Model Gateway (`runGuardedLlmCall`) — không phải mô
              phỏng UI.
            </small>
          </div>
          <div className={styles.fieldGroup}>
            <label>Strict Citation Enforcement</label>
            <select disabled>
              <option>Bắt buộc 100% Agent</option>
            </select>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <Database size={18} />
            <h2>Knowledge Base (GraphRAG)</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label>Chế độ truy vấn (Retrieval Mode)</label>
            <select defaultValue="graph">
              <option value="vector" disabled>
                Vector Search (FAISS) — chưa cấu hình
              </option>
              <option value="graph">GraphRAG (Neo4j)</option>
              <option value="hybrid" disabled>
                Hybrid (Vector + Graph) — chưa cấu hình
              </option>
            </select>
          </div>
        </section>

        <div className={styles.fieldGroup}>
          {banner && <small>{banner}</small>}
          <button className={styles.primaryButton} onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Đang lưu..." : "Lưu thông số vào workflow đang mở"}
          </button>
        </div>
      </div>
    </>
  );
};
