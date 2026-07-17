import { ConditionPrecedent } from "../../types/decision.types";
import { nextId } from "../../utils/ids";

export const notifyCustomer = async (payload: {
  runId: string;
  finalDecision: string;
  conditions: ConditionPrecedent[];
}): Promise<Record<string, unknown>> => ({
  notificationId: nextId("NOTIFY"),
  status: "QUEUED",
  messageType: "NEXT_STEPS_CHECKLIST",
  payload
});

