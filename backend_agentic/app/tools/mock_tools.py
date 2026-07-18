import time
from langchain_core.tools import tool
from app.rag.vector_store import search_policy

@tool
def query_cic_score(customer_id: str) -> float:
    """Queries the Credit Information Center (CIC) to get the credit score for a given customer_id."""
    time.sleep(0.5)
    if "good" in customer_id.lower():
        return 750.0
    elif "bad" in customer_id.lower():
        return 400.0
    return 650.0

@tool
def check_legal_compliance(query: str) -> str:
    """Searches the internal SHB Banking Policies database to determine if a specific request or document is legally compliant."""
    time.sleep(0.5)
    policy_context = search_policy(query)
    return f"Found relevant policies:\n{policy_context}"
