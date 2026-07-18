import os
from langchain_community.document_loaders import TextLoader
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

DATA_PATH = os.path.join(os.path.dirname(__file__), "../../data/shb_policy.txt")
FAISS_INDEX_PATH = os.path.join(os.path.dirname(__file__), "../../data/faiss_index")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

_GLOBAL_VS_CACHE = None

def get_vector_store():
    global _GLOBAL_VS_CACHE
    if _GLOBAL_VS_CACHE is not None:
        return _GLOBAL_VS_CACHE
        
    if os.path.exists(FAISS_INDEX_PATH):
        _GLOBAL_VS_CACHE = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
        return _GLOBAL_VS_CACHE
    
    # Load and index if not exists
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError("SHB Policy data file not found!")
        
    loader = TextLoader(DATA_PATH, encoding="utf-8")
    documents = loader.load()
    
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    docs = text_splitter.split_documents(documents)
    
    _GLOBAL_VS_CACHE = FAISS.from_documents(docs, embeddings)
    _GLOBAL_VS_CACHE.save_local(FAISS_INDEX_PATH)
    return _GLOBAL_VS_CACHE

def search_policy(query: str, k: int = 2) -> str:
    """Search the SHB policy document for relevant context."""
    try:
        vs = get_vector_store()
        docs = vs.similarity_search(query, k=k)
        return "\n\n".join([d.page_content for d in docs])
    except Exception as e:
        return f"Error retrieving policy: {str(e)}"
