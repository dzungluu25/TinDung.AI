from typing import TypedDict, Annotated, List, Any
import operator
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], operator.add]
    request_data: dict
    intent: str
    advisory_response: str
    credit_score: float
    legal_check: bool
    final_decision: str
    trace_log: Annotated[List[dict], operator.add]
    human_approval: Annotated[str, operator.add]
