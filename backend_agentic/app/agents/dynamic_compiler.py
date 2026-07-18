from langgraph.graph import StateGraph, END
from langchain_core.messages import AIMessage
from app.state import AgentState
import time
import json

def compile_dynamic_graph(workflow_data: dict):
    """
    Reads a JSON workflow and compiles it into a LangGraph StateGraph.
    """
    workflow = StateGraph(AgentState)
    
    nodes = workflow_data.get("nodes", [])
    edges = workflow_data.get("edges", [])
    
    # 1. Create nodes dynamically
    def make_node_func(node_data):
        def dynamic_node(state: AgentState):
            label = node_data.get("data", {}).get("label", "Unknown Agent")
            action_desc = f"Executed {label} (LLM: {node_data['data'].get('llm')})"
            trace = {"agent": label, "action": action_desc, "timestamp": time.time()}
            return {
                "messages": [AIMessage(content=f"Output from {label}")],
                "trace_log": [trace]
            }
        return dynamic_node

    for node in nodes:
        workflow.add_node(node["id"], make_node_func(node))
    
    # 2. Add edges
    # We find the node that has no incoming edges as the entry point
    incoming_edges = {e["target"] for e in edges}
    entry_nodes = [n["id"] for n in nodes if n["id"] not in incoming_edges]
    
    if entry_nodes:
        workflow.set_entry_point(entry_nodes[0])
    elif nodes:
        workflow.set_entry_point(nodes[0]["id"])
        
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        branch_value = edge.get("data", {}).get("branchValue")
        
        if branch_value:
            # Semi-sequential: Needs conditional edge logic in real app, mock it for now
            workflow.add_edge(source, target)
        else:
            workflow.add_edge(source, target)
            
    # Add END edges to nodes with no outgoing
    outgoing_edges = {e["source"] for e in edges}
    for node in nodes:
        if node["id"] not in outgoing_edges:
            workflow.add_edge(node["id"], END)
            
    return workflow.compile()
