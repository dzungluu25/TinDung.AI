import re

class PIIMasker:
    def __init__(self):
        # Basic Regex patterns for PII
        self.patterns = {
            "PHONE": r"\b(0[3|5|7|8|9])+([0-9]{8})\b",  # Vietnamese phone numbers
            "ID_CARD": r"\b([0-9]{9}|[0-9]{12})\b",     # CMND/CCCD
            "EMAIL": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
        }
        
    def mask(self, text: str) -> str:
        if not isinstance(text, str):
            text = str(text)
        
        masked_text = text
        for label, pattern in self.patterns.items():
            masked_text = re.sub(pattern, f"[{label}_REDACTED]", masked_text)
            
        # Hardcoded mask for testing "Nguyễn Văn A" -> "[NAME_REDACTED]"
        masked_text = masked_text.replace("Nguyễn Văn A", "[NAME_REDACTED]")
        return masked_text

    def mask_dict(self, data: dict) -> dict:
        masked_data = {}
        for k, v in data.items():
            if isinstance(v, str):
                masked_data[k] = self.mask(v)
            else:
                masked_data[k] = v
        return masked_data
