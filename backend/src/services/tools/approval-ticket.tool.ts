import { nextId } from "../../utils/ids";

export const createApprovalTicket = async (details: Record<string, unknown>): Promise<Record<string, unknown>> => {
  return {
    ticketId: nextId("TKT"),
    status: "CREATED",
    details
  };
};
