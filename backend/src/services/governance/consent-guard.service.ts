import { ConsentRegistry } from "../../types/domain.types";

export interface GuardResult {
  allowed: boolean;
  ruleIds: string[];
  reason?: string;
}

export const assertConsent = (scope: keyof ConsentRegistry["scopes"], registry: ConsentRegistry): GuardResult => {
  const allowed = registry.scopes[scope] === true;
  return {
    allowed,
    ruleIds: ["GOV_CONSENT_SCOPE_REQUIRED"],
    reason: allowed ? undefined : `Missing consent scope: ${scope}`
  };
};

