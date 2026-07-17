import { AuditEvent } from "../../types/domain.types";

const auditEvents: AuditEvent[] = [];

export const appendAuditEvent = (event: AuditEvent): void => {
  auditEvents.push(event);
};

export const listAuditEvents = (runId?: string): AuditEvent[] =>
  runId ? auditEvents.filter((event) => event.runId === runId) : [...auditEvents];

