import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import orchestrationRoutes from "./routes/orchestration.routes";
import { runRoutes, tenantRoutes, workflowRoutes } from "./routes/platform.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/orchestrate", orchestrationRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/runs", runRoutes);

export default app;
