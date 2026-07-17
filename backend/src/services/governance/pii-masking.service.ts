const PII_KEYS = new Set([
  "cccd",
  "passport",
  "accountNumber",
  "phone",
  "email",
  "address",
  "cicCode",
  "customerName"
]);

const maskValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return "***MASKED***";
  }
  if (value.length <= 4) {
    return "***MASKED***";
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

export const maskPii = <T>(payload: T): T => {
  if (Array.isArray(payload)) {
    return payload.map((item) => maskPii(item)) as T;
  }

  if (payload && typeof payload === "object") {
    const masked: Record<string, unknown> = {};
    Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => {
      masked[key] = PII_KEYS.has(key) ? maskValue(value) : maskPii(value);
    });
    return masked as T;
  }

  return payload;
};

