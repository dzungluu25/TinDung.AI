from langgraph.graph import StateGraph, END
from app.state import AgentState
from app.agents.nodes import planner_node, credit_expert_node, legal_expert_node, operations_expert_node

def route_from_planner(state: AgentState):
    intent = state.get("intent", "CREDIT_APPRAISAL")
    if intent in ["ADVISORY", "OUT_OF_DOMAIN"]:
        return END
    return "credit"

from langgraph.checkpoint.memory import MemorySaver

def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("planner", planner_node)
    workflow.add_node("credit", credit_expert_node)
    workflow.add_node("legal", legal_expert_node)
    workflow.add_node("operations", operations_expert_node)
    
    workflow.set_entry_point("planner")
    
    # Conditional edge from planner
    workflow.add_conditional_edges("planner", route_from_planner, {
        "credit": "credit",
        END: END
    })
    
    workflow.add_edge("credit", "legal")
    workflow.add_edge("legal", "operations")
    workflow.add_edge("operations", END)
    
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory, interrupt_before=["operations"])
