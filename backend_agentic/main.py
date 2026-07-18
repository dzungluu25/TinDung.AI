from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import json
from typing import List, Optional, Dict, Any
from fastapi.responses import StreamingResponse
from app.agents.graph import build_graph

app = FastAPI(title="VAIC Banking Multi-Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OrchestrateRequest(BaseModel):
    customer_id: str
    document_text: str

graph = build_graph()

active_sessions = 0

@app.post("/api/agents/orchestrate")
async def orchestrate_agents(req: OrchestrateRequest):
    global active_sessions
    if active_sessions >= 10:
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu đồng thời. Vui lòng thử lại sau.")
        
    active_sessions += 1
    try:
        request_data = {
            "customer_id": req.customer_id,
            "document_text": req.document_text
        }
    
        initial_state = {
            "request_data": request_data,
            "messages": [],
            "trace_log": []
        }
    
        final_state = graph.invoke(initial_state)
        
        intent = final_state.get("intent", "CREDIT_APPRAISAL")
        decision = final_state.get("advisory_response") if intent in ["ADVISORY", "OUT_OF_DOMAIN"] else final_state.get("final_decision")
        
        return {
            "task_id": str(uuid.uuid4()),
            "decision": decision,
            "credit_score": final_state.get("credit_score"),
            "legal_check": final_state.get("legal_check"),
            "trace_log": final_state.get("trace_log")
        }
    finally:
        active_sessions -= 1

class StreamOrchestrateRequest(BaseModel):
    prompt: str
    approvalToken: Optional[str] = None

@app.post("/api/orchestrate/stream")
async def stream_orchestrate(req: StreamOrchestrateRequest):
    global active_sessions
    if active_sessions >= 10:
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu đồng thời. Vui lòng thử lại sau.")
        
    active_sessions += 1
    
    async def event_generator():
        try:
            # We map the prompt to document_text or customer_id logic
            # For simplicity, treat prompt as document_text, customer_id as default
            request_data = {
                "customer_id": "default",
                "document_text": req.prompt
            }
            initial_state = {
                "request_data": request_data,
                "messages": [],
                "trace_log": []
            }
            
            run_id = str(uuid.uuid4())
            config = {"configurable": {"thread_id": run_id}}
            
            # If HITL approvalToken is provided, we resume from the saved state
            if req.approvalToken:
                # Update state manually
                graph.update_state(config, {"human_approval": req.approvalToken}, as_node="operations")
                async for event in graph.astream_events(None, config, version="v2"):
                    node = event.get("name")
                    if event["event"] == "on_chain_end" and node in ["planner", "credit", "legal", "operations"]:
                        trace_obj = {
                            "id": str(uuid.uuid4()), "runId": run_id, "agent": node,
                            "task": f"Resumed {node}", "status": "completed", "summary": "",
                            "toolCalls": [], "startedAt": "", "completedAt": ""
                        }
                        yield json.dumps({"type": "node_update", "node": node, "trace": trace_obj, "riskTier": "COMPLEX"}) + "\n"
            else:
                async for event in graph.astream_events(initial_state, config, version="v2"):
                    node = event.get("name")
                    if event["event"] == "on_chain_start" and node in ["planner", "credit", "legal", "operations"]:
                        trace_obj = {
                            "id": str(uuid.uuid4()), "runId": run_id, "agent": node,
                            "task": f"Running {node}", "status": "running", "summary": "",
                            "toolCalls": [], "startedAt": ""
                        }
                        yield json.dumps({"type": "node_update", "node": node, "trace": trace_obj, "riskTier": "COMPLEX"}) + "\n"
                    elif event["event"] == "on_chain_end" and node in ["planner", "credit", "legal", "operations"]:
                        trace_obj = {
                            "id": str(uuid.uuid4()), "runId": run_id, "agent": node,
                            "task": f"Completed {node}", "status": "completed", "summary": "",
                            "toolCalls": [], "startedAt": "", "completedAt": ""
                        }
                        yield json.dumps({"type": "node_update", "node": node, "trace": trace_obj, "riskTier": "COMPLEX"}) + "\n"
                        
            # Determine if it hit interrupt
            state_snapshot = graph.get_state(config)
            if state_snapshot.next and "operations" in state_snapshot.next:
                # Need to yield an error or something to pause? The frontend might not know what to do if it just stops.
                # Actually, the frontend waits for "final". If we just yield a final answer saying "Needs approval".
                yield json.dumps({
                    "type": "final",
                    "response": {
                        "runId": run_id,
                        "finalAnswer": "Yêu cầu vòng phê duyệt của con người (HITL). Vui lòng xác nhận.",
                        "traces": [],
                        "approvalTicketId": "TICKET-" + run_id[:8]
                    }
                }) + "\n"
            else:
                final_answer = "Đã hoàn tất thẩm định."
                try:
                    final_state = state_snapshot.values
                    final_answer = final_state.get("final_decision", "Hoàn tất")
                except:
                    pass
                yield json.dumps({
                    "type": "final",
                    "response": {
                        "runId": run_id,
                        "finalAnswer": final_answer,
                        "traces": []
                    }
                }) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"
        finally:
            global active_sessions
            active_sessions -= 1

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

@app.post("/api/auth/demo-session")
async def get_demo_session():
    return {"accessToken": "mock_demo_token", "role": "officer", "expiresIn": 3600}

@app.get("/api/orchestrate/{run_id}/traces")
async def get_run_traces(run_id: str):
    return {"runId": run_id, "finalAnswer": "", "traces": []}

# --- WORKFLOW MANAGEMENT API ---
import os
import json
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

WORKFLOW_DB_PATH = "data/workflows.json"

def _load_workflows():
    if not os.path.exists(WORKFLOW_DB_PATH):
        return []
    with open(WORKFLOW_DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_workflows(workflows):
    os.makedirs(os.path.dirname(WORKFLOW_DB_PATH), exist_ok=True)
    with open(WORKFLOW_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(workflows, f, ensure_ascii=False, indent=2)

@app.get("/api/workflows/model-registry")
async def get_model_registry():
    return {"models": [
        {"id": "deepseek-chat", "name": "DeepSeek V3", "provider": "DeepSeek"},
        {"id": "gpt-4o", "name": "GPT-4 Omni", "provider": "OpenAI"},
        {"id": "claude-3-5", "name": "Claude 3.5 Sonnet", "provider": "Anthropic"}
    ]}

@app.get("/api/workflows")
async def list_workflows():
    workflows = _load_workflows()
    return {"workflows": workflows}

@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    workflows = _load_workflows()
    for w in workflows:
        if w.get("id") == workflow_id:
            return w
    raise HTTPException(status_code=404, detail="Workflow not found")

class WorkflowPayload(BaseModel):
    name: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    settings: Optional[Dict[str, Any]] = None

@app.post("/api/workflows")
async def create_workflow(payload: WorkflowPayload):
    workflows = _load_workflows()
    new_workflow = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "nodes": payload.nodes,
        "edges": payload.edges,
        "settings": payload.settings or {}
    }
    workflows.append(new_workflow)
    _save_workflows(workflows)
    return new_workflow

@app.put("/api/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, payload: WorkflowPayload):
    workflows = _load_workflows()
    for w in workflows:
        if w.get("id") == workflow_id:
            w["name"] = payload.name
            w["nodes"] = payload.nodes
            w["edges"] = payload.edges
            if payload.settings is not None:
                w["settings"] = payload.settings
            _save_workflows(workflows)
            return w
    raise HTTPException(status_code=404, detail="Workflow not found")

@app.delete("/api/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    workflows = _load_workflows()
    workflows = [w for w in workflows if w.get("id") != workflow_id]
    _save_workflows(workflows)
    return {"message": "Deleted"}

from fastapi.responses import StreamingResponse
from app.agents.dynamic_compiler import compile_dynamic_graph
import asyncio

class RunWorkflowPayload(BaseModel):
    input: str

@app.post("/api/workflows/{workflow_id}/run/stream")
async def stream_workflow(workflow_id: str, payload: RunWorkflowPayload):
    workflows = _load_workflows()
    workflow_data = next((w for w in workflows if w.get("id") == workflow_id), None)
    
    if not workflow_data:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    dynamic_graph = compile_dynamic_graph(workflow_data)
    
    async def event_generator():
        initial_state = {
            "request_data": {"document_text": payload.input},
            "messages": [],
            "trace_log": []
        }
        
        # We will use .astream_events to yield NDJSON line by line
        try:
            async for event in dynamic_graph.astream_events(initial_state, version="v2"):
                # We map LangGraph events to frontend WorkflowRunEvent
                if event["event"] == "on_chain_start" and event.get("name") not in ["LangGraph", "compile_dynamic_graph", "__start__"]:
                    node_id = event.get("name")
                    yield json.dumps({"type": "node_start", "nodeId": node_id, "label": node_id}) + "\n"
                elif event["event"] == "on_chain_end" and event.get("name") not in ["LangGraph", "compile_dynamic_graph", "__start__"]:
                    node_id = event.get("name")
                    yield json.dumps({
                        "type": "node_done",
                        "nodeId": node_id,
                        "output": {
                            "label": node_id,
                            "text": f"Completed {node_id}",
                            "status": "success"
                        }
                    }) + "\n"
                    
            yield json.dumps({
                "type": "final",
                "summary": "Workflow completed successfully",
                "traces": []
            }) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"
            
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
