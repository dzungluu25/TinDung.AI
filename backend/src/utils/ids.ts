const counters: Record<string, number> = {};

export const nextId = (prefix: string): string => {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return `${prefix}-${String(counters[prefix]).padStart(4, "0")}`;
};

export const newRunId = (): string => `run-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${nextId("seq")}`;

