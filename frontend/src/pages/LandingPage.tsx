import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BrainCircuit,
  Check,
  ChevronRight,
  FileSearch,
  Fingerprint,
  GitBranch,
  Landmark,
  LockKeyhole,
  Scale,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./LandingPage.module.css";

const capabilities = [
  {
    icon: FileSearch,
    index: "01",
    title: "Hiểu hồ sơ",
    description: "Chuẩn hoá thông tin khách hàng, nguồn thu nhập và tài sản thành một hồ sơ có cấu trúc.",
  },
  {
    icon: BrainCircuit,
    index: "02",
    title: "Điều phối chuyên gia",
    description: "Các agent tín dụng, sản phẩm và pháp lý phối hợp trên cùng một trạng thái có thể truy vết.",
  },
  {
    icon: BadgeCheck,
    index: "03",
    title: "Giải thích quyết định",
    description: "Mỗi kết luận đi kèm chỉ số, điều kiện, căn cứ và lịch sử công cụ đã sử dụng.",
  },
];

const agentRows = [
  { icon: FileSearch, name: "Customer Profile", meta: "Hồ sơ đã chuẩn hoá", status: "Hoàn tất" },
  { icon: Banknote, name: "Credit Risk", meta: "DTI · LTV · Stress test", status: "Hoàn tất" },
  { icon: Scale, name: "Legal & Policy", meta: "Đối chiếu chính sách", status: "Đang chạy", active: true },
  { icon: Landmark, name: "Decision Matrix", meta: "Tổng hợp phán quyết", status: "Chờ" },
];

export const LandingPage = () => (
  <div className={styles.page}>
    <header className={styles.navbar}>
      <div className={styles.navInner}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandMark}><Workflow size={20} /></span>
          <span><strong>VAIC</strong><small>Credit Intelligence</small></span>
        </Link>
        <nav className={styles.navLinks} aria-label="Điều hướng landing page">
          <a href="#solution">Giải pháp</a>
          <a href="#workflow">Quy trình</a>
          <a href="#governance">An toàn AI</a>
        </nav>
        <Link to="/workspace" className={styles.navCta}>
          Mở workspace <ArrowRight size={15} />
        </Link>
      </div>
    </header>

    <main>
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><Sparkles size={14} /> AI underwriting, reimagined</div>
          <h1>Thẩm định tín dụng<br /><em>rõ ràng hơn.</em></h1>
          <p className={styles.heroLead}>
            Một không gian làm việc nơi AI agents phối hợp cùng rule engine để phân tích hồ sơ,
            kiểm tra rủi ro và tạo ra quyết định có thể giải thích.
          </p>
          <div className={styles.heroActions}>
            <Link to="/workspace" className={styles.primaryCta}>
              Trải nghiệm ngay <ArrowRight size={17} />
            </Link>
            <a href="#workflow" className={styles.secondaryCta}>Xem cách hoạt động <ChevronRight size={16} /></a>
          </div>
          <div className={styles.trustRow}>
            <span><Check size={13} /> Không cần đăng nhập</span>
            <span><Check size={13} /> Demo trực tiếp</span>
            <span><Check size={13} /> Có thể truy vết</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="Mô phỏng luồng agent">
          <div className={styles.visualTopbar}>
            <div><span className={styles.liveDot} /> Live orchestration</div>
            <span>CASE · 2026-0718</span>
          </div>
          <div className={styles.caseHeader}>
            <div>
              <span>Hồ sơ vay mua nhà</span>
              <strong>2.800.000.000 ₫</strong>
            </div>
            <span className={styles.reviewBadge}>Đang thẩm định</span>
          </div>
          <div className={styles.agentStack}>
            {agentRows.map((agent, index) => (
              <div className={[styles.agentRow, agent.active ? styles.agentActive : ""].filter(Boolean).join(" ")} key={agent.name}>
                <span className={styles.agentLine}>{index < agentRows.length - 1 ? "" : null}</span>
                <span className={styles.agentIcon}><agent.icon size={16} /></span>
                <span className={styles.agentInfo}><strong>{agent.name}</strong><small>{agent.meta}</small></span>
                <span className={styles.agentStatus}>{agent.status}</span>
              </div>
            ))}
          </div>
          <div className={styles.visualFooter}>
            <span><GitBranch size={14} /> Complex lane</span>
            <span>3 / 4 agents</span>
          </div>
        </div>
      </section>

      <section className={styles.signalStrip} aria-label="Điểm nổi bật">
        <div><strong>07</strong><span>agent chuyên biệt</span></div>
        <div><strong>100%</strong><span>decision có dấu vết</span></div>
        <div><strong>2</strong><span>luồng rủi ro thích ứng</span></div>
        <div><strong>HITL</strong><span>human-in-the-loop</span></div>
      </section>

      <section className={styles.section} id="solution">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionKicker}>Năng lực cốt lõi</span>
          <h2>Ít hộp đen hơn.<br />Nhiều căn cứ hơn.</h2>
          <p>Thiết kế theo nguyên tắc AI hỗ trợ lý giải, còn các phép tính tài chính quan trọng được thực hiện bằng rule engine xác định.</p>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map(item => (
            <article className={styles.capability} key={item.index}>
              <span className={styles.capabilityIndex}>{item.index}</span>
              <span className={styles.capabilityIcon}><item.icon size={20} /></span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow">
        <div className={styles.workflowCopy}>
          <span className={styles.sectionKicker}>Agentic workflow</span>
          <h2>Một yêu cầu.<br />Nhiều góc nhìn chuyên môn.</h2>
          <p>Planner phân luồng hồ sơ, các specialist agent xử lý theo vai trò, sau đó Decision Matrix hợp nhất tín hiệu thành kết luận cuối cùng.</p>
          <Link to="/agents" className={styles.textLink}>Khám phá sơ đồ agent <ArrowRight size={16} /></Link>
        </div>
        <div className={styles.workflowDiagram}>
          <span className={styles.flowNode}><Sparkles size={16} /> Planner</span>
          <span className={styles.flowArrow}>→</span>
          <div className={styles.flowGroup}>
            <span><FileSearch size={15} /> Profile</span>
            <span><Banknote size={15} /> Credit</span>
            <span><Scale size={15} /> Legal</span>
          </div>
          <span className={styles.flowArrow}>→</span>
          <span className={[styles.flowNode, styles.flowDecision].join(" ")}><BadgeCheck size={16} /> Decision</span>
        </div>
      </section>

      <section className={styles.governance} id="governance">
        <div className={styles.governanceIcon}><Fingerprint size={26} /></div>
        <div>
          <span className={styles.sectionKicker}>Responsible AI by design</span>
          <h2>Kiểm soát được xây vào từng bước.</h2>
        </div>
        <div className={styles.governanceItems}>
          <span><LockKeyhole size={16} /> PII masking</span>
          <span><GitBranch size={16} /> Audit trail</span>
          <span><BadgeCheck size={16} /> Human approval</span>
        </div>
      </section>

      <section className={styles.finalCta}>
        <span>Ready when you are.</span>
        <h2>Bắt đầu với một hồ sơ mẫu.</h2>
        <Link to="/workspace">Mở AI workspace <ArrowRight size={18} /></Link>
      </section>
    </main>

    <footer className={styles.footer}>
      <span>VAIC 2026 · AI Credit Intelligence</span>
      <span>Designed for explainable decisions</span>
    </footer>
  </div>
);
