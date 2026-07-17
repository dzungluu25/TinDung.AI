import { ConditionPrecedent } from "../../types/decision.types";
import { nextId } from "../../utils/ids";

export const createApprovalLetter = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => ({
  approvalLetterId: nextId("LETTER"),
  status: "CREATED",
  payload
});

export const createLosApprovalRecord = async (
  payload: Record<string, unknown>,
  approvalToken?: string
): Promise<Record<string, unknown>> => ({
  losRecordId: nextId("LOS"),
  status: approvalToken ? "CREATED" : "BLOCKED",
  approvalTokenPresent: Boolean(approvalToken),
  payload
});

export const createPendingFacility = async (
  payload: Record<string, unknown>,
  approvalToken?: string
): Promise<Record<string, unknown>> => ({
  facilityId: nextId("FACILITY"),
  status: approvalToken ? "PENDING_CONDITIONS" : "BLOCKED",
  approvalTokenPresent: Boolean(approvalToken),
  payload
});

export const setConditionPrecedents = async (
  facilityId: string,
  conditions: ConditionPrecedent[]
): Promise<Record<string, unknown>> => ({
  facilityId,
  status: "CONDITIONS_ATTACHED",
  conditions
});

