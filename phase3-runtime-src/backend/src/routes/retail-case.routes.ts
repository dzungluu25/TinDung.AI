import { Router } from "express";
import {
  getIngestionStatus,
  ingestDocumentRequest,
} from "../controllers/ingestion.controller";
import {
  approveRequest,
  getRequest,
  getRequestAudit,
  getRequestGovernance,
  getKhcnEvaluation,
  getKhcnEvaluationMarkdown,
  getModelGateway,
  listCases,
  explainRequestWithModel,
  previewCase,
  runCase,
} from "../controllers/retail-case.controller";
import { requireApprovalAuth } from "../middlewares/auth.middleware";

const router = Router();

router.get("/cases", listCases);
router.get("/cases/:caseId/preview", previewCase);
router.post("/cases/:caseId/run", runCase);
router.get("/requests/:requestId", getRequest);
router.post("/requests/:requestId/approve", requireApprovalAuth, approveRequest);
router.get("/requests/:requestId/audit", getRequestAudit);
router.get("/requests/:requestId/governance", getRequestGovernance);
router.get("/evaluation/khcn", getKhcnEvaluation);
router.get("/evaluation/khcn/markdown", getKhcnEvaluationMarkdown);
router.get("/model-gateway/status", getModelGateway);
router.get("/ingestion/status", getIngestionStatus);
router.post("/ingestion/documents", requireApprovalAuth, ingestDocumentRequest);
router.post("/requests/:requestId/model-explanation", requireApprovalAuth, explainRequestWithModel);

export default router;
