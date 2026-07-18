import { useState, type FormEvent } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { login } from "../../services/authService";
import { ApiError } from "../../services/httpClient";
import { useAgentStream } from "../../hooks/useAgentStream";
import { useOrchestrationStore } from "../../store/orchestrationStore";
import styles from "./ApprovalGate.module.css";

/**
 * Shown only when the backend reports a HIGH-write action (Core Banking facility
 * registration) is waiting on a human_approval_token. The reviewer authenticates as a
 * CREDIT_APPROVER (separately from the officer session that submitted the case) and the
 * resulting JWT is sent back as `approvalToken` — the same re-submission the backend's
 * operations agent already verifies in `verifyApprovalToken` (role must be CREDIT_APPROVER).
 */
export const ApprovalGate = () => {
  const prompt = useOrchestrationStore(s => s.prompt);
  const { run, phase } = useAgentStream();
  const [username, setUsername] = useState("approver.lan");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const isBusy = submitting || phase === "running";

  const handleApprove = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || isBusy) return;

    setFormError(undefined);
    setSubmitting(true);
    try {
      const session = await login(username, password);
      if (session.role !== "CREDIT_APPROVER") {
        setFormError("Tài khoản này không có vai trò CREDIT_APPROVER, không thể ký duyệt.");
        return;
      }
      await run(prompt, session.accessToken);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Đăng nhập người duyệt thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleApprove} className={styles.gate} aria-label="Phê duyệt người (Human-in-the-loop)">
      <div className={styles.header}>
        <ShieldCheck size={16} />
        <div>
          <strong>Hồ sơ đang chờ người duyệt</strong>
          <span>Đăng nhập với vai trò CREDIT_APPROVER để ký duyệt và ghi khế ước lên Core Banking.</span>
        </div>
      </div>

      <div className={styles.fields}>
        <input
          className={styles.input}
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Tên đăng nhập người duyệt"
          disabled={isBusy}
          autoComplete="username"
        />
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          disabled={isBusy}
          autoComplete="current-password"
        />
      </div>

      {formError && <div className={styles.error} role="alert">{formError}</div>}

      <button type="submit" className={styles.submit} disabled={!password || isBusy}>
        {isBusy ? <Loader2 size={16} className={styles.spin} /> : <ShieldCheck size={16} />}
        {isBusy ? "Đang xử lý…" : "Phê duyệt & ghi Core Banking"}
      </button>
    </form>
  );
};
