import networkx as nx

class GraphStore:
    def __init__(self):
        self.graph = nx.DiGraph()
        self._build_mock_graph()

    def _build_mock_graph(self):
        # Nodes represent entities or policy documents
        self.graph.add_node("Policy_A", content="DTI limit is 40%.")
        self.graph.add_node("Policy_B", content="If customer is VIP, DTI limit is 50%.")
        self.graph.add_node("Customer_VIP_Status", content="Criteria for VIP: Deposit > 1B VND")

        # Edges represent semantic relationships
        self.graph.add_edge("Policy_A", "Policy_B", relationship="has_exception")
        self.graph.add_edge("Policy_B", "Customer_VIP_Status", relationship="depends_on")

    def search(self, query: str) -> str:
        """
        Simulate a GraphRAG search by traversing nodes based on simple keyword matching.
        In a real scenario, this uses vector embeddings + Cypher query on Neo4j.
        """
        results = []
        if "dti" in query.lower() or "vip" in query.lower():
            # Traverse graph: Policy A -> Policy B -> VIP Status
            for node, data in self.graph.nodes(data=True):
                results.append(f"[{node}]: {data['content']}")
            
            # Show relationships
            for u, v, data in self.graph.edges(data=True):
                results.append(f"Relationship: {u} --({data['relationship']})--> {v}")
                
        return "\n".join(results) if results else "No relevant GraphRAG context found."

# Singleton instance
graph_store = GraphStore()
