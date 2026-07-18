import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlow, addEdge, Background, Controls, applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type { Connection, Edge, Node, NodeChange, EdgeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Header } from "../layouts/Header";
import { AgentNode } from "../components/builder/AgentNode";
import { getDemoAccessToken } from "../services/authService";
import {
  getModelRegistry,
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  streamWorkflowRun,
} from "../services/workflowService";
import { ApiError } from "../services/httpClient";
import type { ModelRegistryEntry, WorkflowDefinition, WorkflowEdgeDto, WorkflowNodeDto } from "../types/workflow";
import { useWorkflowStore } from "../store/workflowStore";
import styles from "./WorkflowBuilderPage.module.css";
import { Bot, Network, Workflow, Save, Play } from "lucide-react";

const nodeTypes = { agentNode: AgentNode };

const DEFAULT_LLM = "fpt-gpt-oss-120b";

const initialNodes: Node[] = [
  {
    id: "1",
    type: "agentNode",
    position: { x: 250, y: 50 },
    data: { label: "Planner Agent", agentType: "Sequential", llm: DEFAULT_LLM, knowledge: "none", mcp: "none" },
  },
];

const initialEdges: Edge[] = [];

type RunStatus = "running" | "success" | "needs_review" | "failed";

export const WorkflowBuilderPage = () => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [modelOptions, setModelOptions] = useState<ModelRegistryEntry[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowDefinition[]>([]);
  const workflowId = useWorkflowStore(s => s.currentWorkflowId);
  const workflowName = useWorkflowStore(s => s.currentWorkflowName) ?? "Workflow chưa đặt tên";
  const settings = useWorkflowStore(s => s.settings);
  const setCurrentWorkflow = useWorkflowStore(s => s.setCurrentWorkflow);
  const setSettings = useWorkflowStore(s => s.setSettings);
  const [runInput, setRunInput] = useState("");
  const [nodeStatus, setNodeStatus] = useState<Record<string, RunStatus>>({});
  const [logLines, setLogLines] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [banner, setBanner] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getDemoAccessToken();
        const [{ models }, { workflows }] = await Promise.all([getModelRegistry(token), listWorkflows(token)]);
        setModelOptions(models);
        setSavedWorkflows(workflows);
      } catch (err) {
        setBanner(err instanceof ApiError ? err.message : "Không tải được model registry / danh sách workflow.");
      }
    })();
  }, []);

  const updateNodeField = useCallback((nodeId: string, field: "llm" | "knowledge" | "mcp", value: string) => {
    setNodes(nds => nds.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, [field]: value } } : n)));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<Node>[]) => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => setEdges(eds => applyEdgeChanges(changes, eds)), []);

  const onConnect = useCallback((params: Connection) => {
    if (params.sourceHandle === "b") {
      // Conditional (Semi-sequential) edge — ask which `branch` value routes down this
      // path. A dedicated branch editor is a nice-to-have left for later; this is enough
      // to configure real conditional routing without faking it.
      const branchValue = window.prompt("Tên nhánh (branch) cho cạnh điều kiện này:", params.target ?? "");
      setEdges(eds => addEdge({ ...params, animated: true, data: { branchValue: branchValue || undefined } }, eds));
      return;
    }
    setEdges(eds => addEdge({ ...params, animated: true }, eds));
  }, []);

  const addAgent = (type: string) => {
    const newNode: Node = {
      id: Date.now().toString(),
      type: "agentNode",
      position: { x: 100, y: nodes.length * 100 + 100 },
      data: { label: `New ${type}`, agentType: type, llm: DEFAULT_LLM, knowledge: "none", mcp: "none" },
    };
    setNodes(nds => [...nds, newNode]);
  };

  const toDto = (): { nodes: WorkflowNodeDto[]; edges: WorkflowEdgeDto[] } => ({
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.type ?? "agentNode",
      position: n.position,
      data: {
        label: String(n.data.label ?? ""),
        agentType: n.data.agentType as WorkflowNodeDto["data"]["agentType"],
        llm: String(n.data.llm ?? DEFAULT_LLM),
        knowledge: n.data.knowledge as WorkflowNodeDto["data"]["knowledge"],
        mcp: n.data.mcp as WorkflowNodeDto["data"]["mcp"],
      },
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      data: e.data as { branchValue?: string } | undefined,
    })),
  });

  const handleSave = async () => {
    setIsSaving(true);
    setBanner(undefined);
    try {
      const token = await getDemoAccessToken();
      const { nodes: nodeDtos, edges: edgeDtos } = toDto();

      const saved = workflowId
        ? await updateWorkflow(workflowId, { name: workflowName, nodes: nodeDtos, edges: edgeDtos, settings }, token)
        : await createWorkflow({ name: workflowName, nodes: nodeDtos, edges: edgeDtos, settings }, token);

      setCurrentWorkflow(saved.id, saved.name);
      const { workflows } = await listWorkflows(token);
      setSavedWorkflows(workflows);
      setBanner(`Đã lưu "${saved.name}".`);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Lưu workflow thất bại.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async (id: string) => {
    setBanner(undefined);
    try {
      const token = await getDemoAccessToken();
      const workflow = await getWorkflow(id, token);
      setCurrentWorkflow(workflow.id, workflow.name);
      setSettings(workflow.settings);
      setNodes(workflow.nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data as unknown as Record<string, unknown> })));
      setEdges(workflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, data: e.data, animated: true })));
      setNodeStatus({});
      setLogLines([]);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Tải workflow thất bại.");
    }
  };

  const handleRun = async () => {
    if (!runInput.trim() || isRunning) return;
    setBanner(undefined);
    setLogLines([]);
    setNodeStatus({});

    let id = workflowId;
    if (!id) {
      await handleSave();
      id = useWorkflowStore.getState().currentWorkflowId; // handleSave updated the store; re-read it directly to avoid a stale closure value
    }
    if (!id) return; // save failed, banner already set

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    try {
      const token = await getDemoAccessToken();
      await streamWorkflowRun(id, runInput, token, event => {
        if (event.type === "node_start") {
          setNodeStatus(prev => ({ ...prev, [event.nodeId]: "running" }));
          setLogLines(lines => [...lines, `▶ ${event.label} bắt đầu chạy...`]);
        } else if (event.type === "node_done") {
          setNodeStatus(prev => ({ ...prev, [event.nodeId]: event.output.status }));
          setLogLines(lines => [...lines, `✓ ${event.output.label}: ${event.output.text}`]);
        } else if (event.type === "node_error") {
          setNodeStatus(prev => ({ ...prev, [event.nodeId]: "failed" }));
          setLogLines(lines => [...lines, `✗ Lỗi tại node: ${event.message}`]);
        } else if (event.type === "final") {
          setLogLines(lines => [...lines, `— ${event.summary}`]);
        } else if (event.type === "error") {
          setLogLines(lines => [...lines, `✗ ${event.message}`]);
        }
      }, controller.signal);
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : "Chạy workflow thất bại.");
    } finally {
      setIsRunning(false);
    }
  };

  const renderedNodes = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      modelOptions,
      runStatus: nodeStatus[n.id],
      onFieldChange: (field: "llm" | "knowledge" | "mcp", value: string) => updateNodeField(n.id, field, value),
    },
  }));

  return (
    <div className={styles.container}>
      <Header
        eyebrow="Platform builder"
        title="Workflow Designer"
        subtitle="Kéo thả và tùy chỉnh các Agent để xây dựng luồng thẩm định tín dụng riêng biệt."
      />

      <div className={styles.toolbar}>
        <input
          className={styles.nameInput}
          value={workflowName}
          onChange={e => setCurrentWorkflow(workflowId, e.target.value)}
          placeholder="Tên workflow"
        />
        <select className={styles.loadSelect} value={workflowId ?? ""} onChange={e => e.target.value && void handleLoad(e.target.value)}>
          <option value="">Tải workflow đã lưu...</option>
          {savedWorkflows.map(w => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button className={styles.toolbarButton} onClick={() => void handleSave()} disabled={isSaving}>
          <Save size={14} /> {isSaving ? "Đang lưu..." : "Lưu"}
        </button>
        <input
          className={styles.runInput}
          value={runInput}
          onChange={e => setRunInput(e.target.value)}
          placeholder="Nhập yêu cầu để chạy thử workflow..."
        />
        <button className={styles.runButton} onClick={() => void handleRun()} disabled={isRunning || !runInput.trim()}>
          <Play size={14} /> {isRunning ? "Đang chạy..." : "Chạy"}
        </button>
      </div>

      {banner && <div className={styles.banner}>{banner}</div>}

      <div className={styles.workspace}>
        <div className={styles.sidebar}>
          <h3>Agent Types</h3>
          <p>Kéo hoặc click để thêm Agent vào luồng.</p>

          <button className={styles.agentButton} onClick={() => addAgent("Sequential")}>
            <Bot size={18} />
            <div className={styles.agentInfo}>
              <strong>Sequential Agent</strong>
              <span>Thực thi tuần tự 1-1</span>
            </div>
          </button>

          <button className={styles.agentButton} onClick={() => addAgent("Semi-sequential")}>
            <Network size={18} />
            <div className={styles.agentInfo}>
              <strong>Semi-sequential Agent</strong>
              <span>Hỗ trợ Conditional Edge (Rẽ nhánh)</span>
            </div>
          </button>

          <button className={styles.agentButton} onClick={() => addAgent("Free")}>
            <Workflow size={18} />
            <div className={styles.agentInfo}>
              <strong>Free Agent (Autonomous)</strong>
              <span>Tự động lặp lại và gọi Tool</span>
            </div>
          </button>

          <div className={styles.logPanel}>
            <h3>Nhật ký chạy</h3>
            <div className={styles.logList}>
              {logLines.length === 0 && <p className={styles.logEmpty}>Chưa có lần chạy nào.</p>}
              {logLines.map((line, idx) => (
                <p key={idx} className={styles.logLine}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.canvas}>
          <ReactFlow
            nodes={renderedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};
