import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  getModelRegistryHandler,
  listWorkflowsHandler,
  getWorkflowHandler,
  createWorkflowHandler,
  updateWorkflowHandler,
  deleteWorkflowHandler,
  runWorkflowStreamHandler,
} from "../controllers/workflow.controller";

const router = Router();

// Same two demo roles as the retail-credit pipeline — no per-workflow ownership check
// in this v1 slice (see plan doc), any authenticated officer/approver can manage any
// saved workflow.
const auth = requireAuth("CREDIT_OFFICER", "CREDIT_APPROVER");

router.get("/model-registry", auth, getModelRegistryHandler);
router.get("/", auth, listWorkflowsHandler);
router.post("/", auth, createWorkflowHandler);
router.get("/:id", auth, getWorkflowHandler);
router.put("/:id", auth, updateWorkflowHandler);
router.delete("/:id", auth, deleteWorkflowHandler);
router.post("/:id/run/stream", auth, runWorkflowStreamHandler);

export default router;
