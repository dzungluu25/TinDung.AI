import os
from typing import List
import time
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from app.state import AgentState
from app.tools.mock_tools import query_cic_score, check_legal_compliance
from app.tools.pii_masker import PIIMasker

load_dotenv()

llm = ChatOpenAI(
    model=os.getenv("DEEPSEEK_MODEL_NAME", "deepseek-chat"),
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url=os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1"),
    max_tokens=500
)

masker = PIIMasker()

from app.core.hardness import Citation

class IntentClassification(BaseModel):
    intent: str = Field(description="Must be exactly one of: CREDIT_APPRAISAL, ADVISORY, or OUT_OF_DOMAIN")
    response: str = Field(description="The response content for the intent.")
    citations: List[Citation] = Field(description="Must provide citations from the user request.")

def _call_agent_with_tool(prompt_text: str, tool, fallback_value):
    llm_with_tools = llm.bind_tools([tool])
    try:
        response = llm_with_tools.invoke([HumanMessage(content=prompt_text)])
        if response.tool_calls:
            tool_call = response.tool_calls[0]
            result = tool.invoke(tool_call["args"])
            return True, result, f"Used Tool {tool_call['name']}"
        return False, fallback_value, "BLOCKED_DUE_TO_NO_TOOL_CALLED"
    except Exception as e:
        return False, fallback_value, f"BLOCKED_DUE_TO_API_ERROR: {str(e)}"

def planner_node(state: AgentState):
    request_data = state.get("request_data", {})
    masked_data = masker.mask_dict(request_data)
    
    prompt = f"You are an AI Intent Classifier for VAIC Banking. Analyze this user request: '{masked_data}'.\n" \
             "Classify the intent into ONE of these exactly: CREDIT_APPRAISAL, ADVISORY, or OUT_OF_DOMAIN.\n" \
             "If CREDIT_APPRAISAL, provide a 1-sentence summary.\n" \
             "If ADVISORY, provide a professional answer to the banking/legal question.\n" \
             "If OUT_OF_DOMAIN, respond with: 'Tôi là Trợ lý ảo hỗ trợ thẩm định tín dụng VAIC. Vui lòng đặt câu hỏi liên quan đến ngân hàng.'\n"
             
    try:
        structured_llm = llm.with_structured_output(IntentClassification)
        data = structured_llm.invoke([HumanMessage(content=prompt)])
        intent = data.intent
        analysis = data.response
        citations_str = "; ".join([f"[{c.source}]: {c.quote}" for c in data.citations])
        action_desc = f"Classified intent as {intent}. Citations: {citations_str}"
    except Exception as e:
        intent = "CREDIT_APPRAISAL"
        analysis = f"Error classifying intent: {str(e)}. Proceeding with appraisal."
        action_desc = f"Classified intent as {intent} (Fallback due to error)"
        
    trace = {"agent": "Planner", "action": action_desc, "timestamp": time.time()}
    message = AIMessage(content=analysis)
    
    return {
        "messages": [message],
        "intent": intent,
        "advisory_response": analysis if intent in ["ADVISORY", "OUT_OF_DOMAIN"] else "",
        "trace_log": [trace]
    }

def credit_expert_node(state: AgentState):
    request_data = state.get("request_data", {})
    customer_id = request_data.get("customer_id", "default")
    masked_id = masker.mask(customer_id)
    
    prompt = f"You are a Banking Credit Expert. Query the credit score for customer ID '{masked_id}'. You must use the provided tool."
    
    success, score, action_desc = _call_agent_with_tool(prompt, query_cic_score, fallback_value=0.0)
    
    if success:
        # Use Layer Hardness to enforce citation of the score
        final_prompt = f"Based on the queried score {score}, please state the final credit score and provide a citation to the tool that provided it."
        guarded_response = with_guardrails(llm, final_prompt, fallback_msg=str(score), max_retries=2)
        citations_str = "; ".join([f"[{c.source}]: {c.quote}" for c in guarded_response.citations])
        action_desc += f" -> Score: {score}. Citations: {citations_str}"

    trace = {"agent": "Credit Expert", "action": action_desc, "timestamp": time.time()}
    message = AIMessage(content=f"Credit score calculated: {score}")
    
    return {
        "messages": [message],
        "credit_score": float(score),
        "trace_log": [trace]
    }

from app.core.hardness import with_guardrails

def legal_expert_node(state: AgentState):
    request_data = state.get("request_data", {})
    doc_text = request_data.get("document_text", "")
    masked_text = masker.mask(doc_text)
    
    prompt = f"You are a Banking Legal Expert. Check the compliance of this document: '{masked_text}'. Use the tool to search the policies."
    
    success, policy_result, action_desc = _call_agent_with_tool(prompt, check_legal_compliance, fallback_value=False)
    
    is_compliant = False
    if success:
        try:
            final_prompt = f"Based on these policies:\n{policy_result}\nIs the document '{masked_text}' compliant? Answer 'PASSED' or 'FAILED'."
            # Use Layer Hardness to enforce citation
            guarded_response = with_guardrails(llm, final_prompt, fallback_msg="FAILED", max_retries=2)
            
            is_compliant = "PASSED" in guarded_response.answer.upper()
            citations_str = "; ".join([f"[{c.source}]: {c.quote}" for c in guarded_response.citations])
            action_desc = f"Evaluated: {is_compliant}. Citations: {citations_str}"
        except Exception as e:
            action_desc = f"Evaluation failed: {str(e)}"
        
    trace = {"agent": "Legal Expert", "action": action_desc, "timestamp": time.time()}
    message = AIMessage(content=f"Legal compliance check: {'Passed' if is_compliant else 'Failed'}")
    
    return {
        "messages": [message],
        "legal_check": is_compliant,
        "trace_log": [trace]
    }

def operations_expert_node(state: AgentState):
    score = state.get("credit_score", 0)
    is_compliant = state.get("legal_check", False)
    
    prompt = f"You are a Banking Operations Agent. The Credit score is {score} (requires >= 600) and Legal compliance is {is_compliant}. Make a final decision. Start your answer with either PENDING_APPROVAL (if passed) or REJECTED (if failed). Never output APPROVED directly without human review."
    
    guarded_response = with_guardrails(llm, prompt, fallback_msg="REJECTED", max_retries=2)
    decision_text = guarded_response.answer
    decision = "PENDING_APPROVAL" if "PENDING_APPROVAL" in decision_text else "REJECTED"
    
    citations_str = "; ".join([f"[{c.source}]: {c.quote}" for c in guarded_response.citations])
    action_desc = f"{decision} (Citations: {citations_str})"
        
    trace = {"agent": "Operations Expert", "action": action_desc, "timestamp": time.time()}
    message = AIMessage(content=decision_text)
    
    return {
        "messages": [message],
        "final_decision": decision,
        "trace_log": [trace]
    }
