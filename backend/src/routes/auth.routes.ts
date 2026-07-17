import { Router } from "express";
import { createDemoSession, login } from "../controllers/auth.controller";

const router = Router();

router.post("/login", login);
router.post("/demo-session", createDemoSession);

export default router;
