import json
from pydantic import BaseModel, Field
from typing import List, Optional
from langchain_core.messages import HumanMessage

class Citation(BaseModel):
    source: str = Field(description="The source document, tool, or ID where the information was found.")
    quote: str = Field(description="The exact quote or specific data point extracted.")

class EnforcedResponse(BaseModel):
    answer: str = Field(description="The main answer or decision from the agent.")
    citations: List[Citation] = Field(description="Must contain at least one citation to prove the answer.")

def with_guardrails(llm, prompt: str, fallback_msg: str, max_retries: int = 2) -> EnforcedResponse:
    """
    Layer Hardness: Enforces that the LLM output strictly contains citations.
    If it fails or hallucinates, it retries up to max_retries.
    """
    structured_llm = llm.with_structured_output(EnforcedResponse)
    
    for attempt in range(max_retries):
        try:
            response = structured_llm.invoke([HumanMessage(content=prompt)])
            if not response.citations or len(response.citations) == 0:
                raise ValueError("Missing citations. You MUST provide at least one citation.")
            return response
        except Exception as e:
            if attempt == max_retries - 1:
                # Return safe fallback if all retries fail
                return EnforcedResponse(
                    answer=f"{fallback_msg} (Fallback applied due to Guardrail violation: {str(e)})",
                    citations=[Citation(source="System Hardness Layer", quote="Auto-fallback triggered")]
                )
            # Adjust prompt to force correction on next retry
            prompt += f"\n\nSystem Error on previous attempt: {str(e)}. Please try again and ENSURE valid JSON with citations."
    
    return EnforcedResponse(
        answer=fallback_msg, 
        citations=[Citation(source="System", quote="Fallback")]
    )
