import { pgQuery } from "../../config/pg";
import { getNeo4jSession } from "../../config/neo4j";
import { setupOrchestrationCheckpointer } from "../orchestration/orchestration-graph";
import { seedLegalKnowledgeGraph } from "./knowledge-graph-seed.service";

export const seedDatabases = async () => {
  console.log("=== STARTING DATABASE SEED PROCESS ===");

  try {
    // 1. PostgreSQL Seeding
    console.log("Initializing PostgreSQL Tables...");
    
    // Create retail_cases table
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS retail_cases (
        case_id VARCHAR(50) PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL DEFAULT 'bank-default',
        customer_id VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        CONSTRAINT retail_cases_payload_identity_check CHECK (
          jsonb_typeof(payload) = 'object'
          AND payload->>'caseId' = case_id
          AND payload->>'customerId' = customer_id
        )
      );
    `);
    await pgQuery(`ALTER TABLE retail_cases ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'bank-default';`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_retail_cases_tenant_case ON retail_cases (tenant_id,case_id);`);

    // CREATE TABLE IF NOT EXISTS does not retrofit constraints onto an existing table.
    await pgQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'retail_cases_payload_identity_check'
        ) THEN
          ALTER TABLE retail_cases
          ADD CONSTRAINT retail_cases_payload_identity_check CHECK (
            jsonb_typeof(payload) = 'object'
            AND payload->>'caseId' = case_id
            AND payload->>'customerId' = customer_id
          );
        END IF;
      END $$;
    `);

    // Create orchestration_runs table to persist traces in production
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        run_id VARCHAR(50) PRIMARY KEY,
        case_id VARCHAR(50),
        prompt TEXT,
        status VARCHAR(50) NOT NULL,
        response_payload JSONB NOT NULL,
        CONSTRAINT orchestration_runs_payload_identity_check CHECK (
          jsonb_typeof(response_payload) = 'object'
          AND response_payload->>'runId' = run_id
        ),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pgQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'orchestration_runs_payload_identity_check'
        ) THEN
          ALTER TABLE orchestration_runs
          ADD CONSTRAINT orchestration_runs_payload_identity_check CHECK (
            jsonb_typeof(response_payload) = 'object'
            AND response_payload->>'runId' = run_id
          );
        END IF;
      END $$;
    `);

    await pgQuery(`ALTER TABLE orchestration_runs ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'bank-default', ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(100), ADD COLUMN IF NOT EXISTS workflow_version VARCHAR(30), ADD COLUMN IF NOT EXISTS config_version VARCHAR(30);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_runs_tenant_status ON orchestration_runs (tenant_id,status,created_at DESC);`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS workflow_versions (tenant_id VARCHAR(100) NOT NULL, workflow_id VARCHAR(100) NOT NULL, version VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL, definition JSONB NOT NULL, created_by VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL, published_by VARCHAR(100), published_at TIMESTAMPTZ, PRIMARY KEY (tenant_id,workflow_id,version));`);
    await pgQuery(`CREATE OR REPLACE FUNCTION prevent_published_workflow_mutation() RETURNS trigger AS $$ BEGIN IF OLD.status='published' THEN RAISE EXCEPTION 'published workflow versions are immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;`);
    await pgQuery(`DROP TRIGGER IF EXISTS trg_published_workflow_immutable ON workflow_versions;`);
    await pgQuery(`CREATE TRIGGER trg_published_workflow_immutable BEFORE UPDATE OR DELETE ON workflow_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_workflow_mutation();`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS tenant_runtime_configs (tenant_id VARCHAR(100) NOT NULL, version VARCHAR(30) NOT NULL, payload JSONB NOT NULL, effective_from TIMESTAMPTZ NOT NULL, updated_by VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (tenant_id,version));`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS approval_records (id UUID PRIMARY KEY, tenant_id VARCHAR(100) NOT NULL, run_id VARCHAR(50) NOT NULL, checkpoint_id VARCHAR(200) NOT NULL, workflow_id VARCHAR(100) NOT NULL, workflow_version VARCHAR(30) NOT NULL, required_role VARCHAR(50) NOT NULL, status VARCHAR(30) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, decided_by VARCHAR(100), decided_at TIMESTAMPTZ, comment TEXT, created_at TIMESTAMPTZ NOT NULL);`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS idx_approvals_tenant_run ON approval_records (tenant_id,run_id,status);`);
    await pgQuery(`CREATE UNIQUE INDEX IF NOT EXISTS uq_approvals_pending_run ON approval_records (tenant_id,run_id) WHERE status='pending';`);
    await pgQuery(`CREATE TABLE IF NOT EXISTS action_executions (seq BIGSERIAL PRIMARY KEY, tenant_id VARCHAR(100) NOT NULL, run_id VARCHAR(50) NOT NULL, step_id VARCHAR(100) NOT NULL, idempotency_key VARCHAR(300) NOT NULL, status VARCHAR(30) NOT NULL, attempts INTEGER NOT NULL, result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (tenant_id,idempotency_key));`);

    const bootstrapWorkflow = { id:"loan-pre-approval",tenantId:"bank-default",name:"Loan pre-approval",nodes:[{id:"start",type:"start"},{id:"planner",type:"planner"},{id:"credit",type:"agent",outputSchema:{type:"object"},citationRequired:true,retryLimit:2},{id:"human-gate",type:"human_gate"},{id:"action",type:"action",risk:"high",allowedTools:["reserveCreditLimit","createLoanCase","createRmTask","updateCrmStatus","sendRejectionNotification","escalateCreditCommittee"],compensationNodeId:"compensate"},{id:"compensate",type:"compensation"},{id:"end",type:"end"}],edges:[{from:"start",to:"planner"},{from:"planner",to:"credit"},{from:"credit",to:"human-gate",condition:"requiresApproval",fallback:true},{from:"human-gate",to:"action"},{from:"action",to:"end"}] };
    const existingWorkflow = await pgQuery(
      `SELECT 1 FROM workflow_versions WHERE tenant_id = $1 AND workflow_id = $2 AND version = $3`,
      ["bank-default", "loan-pre-approval", "1.2.0"]
    );
    if (existingWorkflow.rowCount === 0) {
      await pgQuery(`INSERT INTO workflow_versions (tenant_id,workflow_id,version,status,definition,created_by,created_at,published_by,published_at) VALUES ('bank-default','loan-pre-approval','1.2.0','published',$1,'system',NOW(),'system',NOW()) ON CONFLICT (tenant_id,workflow_id,version) DO NOTHING`,[bootstrapWorkflow]);
      console.log("Seeded bootstrap workflow_versions row (bank-default/loan-pre-approval/1.2.0).");
    } else {
      console.log("Skipping workflow_versions seed: bank-default/loan-pre-approval/1.2.0 already exists.");
    }

    const bootstrapConfig = {tenantId:"bank-default",version:"1.0.0",thresholds:{minCreditScore:650,maxDti:0.45},runtime:{maxRetriesPerAgent:2,maxSteps:100,maxTokens:50000,timeoutSeconds:90},allowedModels:[process.env.FPT_PLANNER_MODEL||"approved-default"],citationPolicy:{required:true,rejectIfMissing:true,minimumConfidence:0.8,allowedSourceTypes:["LAW","DECREE","CIRCULAR","INTERNAL_POLICY","STANDARD"]},effectiveFrom:"2026-01-01T00:00:00.000Z",updatedBy:"system"};
    const existingConfig = await pgQuery(
      `SELECT 1 FROM tenant_runtime_configs WHERE tenant_id = $1 AND version = $2`,
      ["bank-default", "1.0.0"]
    );
    if (existingConfig.rowCount === 0) {
      await pgQuery(`INSERT INTO tenant_runtime_configs (tenant_id,version,payload,effective_from,updated_by) VALUES ('bank-default','1.0.0',$1,$2,'system') ON CONFLICT (tenant_id,version) DO NOTHING`,[bootstrapConfig,bootstrapConfig.effectiveFrom]);
      console.log("Seeded bootstrap tenant_runtime_configs row (bank-default/1.0.0).");
    } else {
      console.log("Skipping tenant_runtime_configs seed: bank-default/1.0.0 already exists.");
    }

    // Create the append-only, hash-chained audit log table required for regulatory audit trails.
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS audit_events (
        seq BIGSERIAL PRIMARY KEY,
        event_id VARCHAR(60) NOT NULL UNIQUE,
        run_id VARCHAR(50) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        actor VARCHAR(100) NOT NULL,
        action_type VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL,
        details TEXT NOT NULL,
        prev_hash CHAR(64) NOT NULL,
        hash CHAR(64) NOT NULL
      );
    `);

    await pgQuery(`
      CREATE INDEX IF NOT EXISTS idx_audit_events_run_id ON audit_events (run_id);
    `);

    // Enforce append-only semantics at the database level: even a compromised app
    // credential cannot rewrite or erase history without first dropping this trigger,
    // which itself would be a distinct, auditable DDL event in Postgres's own logs.
    await pgQuery(`
      CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pgQuery(`
      DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
    `);

    await pgQuery(`
      CREATE TRIGGER trg_audit_events_immutable
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
    `);

    // Create LangGraph's own checkpoint tables so an in-flight orchestration run's
    // graph state survives a server restart/crash instead of being lost.
    await setupOrchestrationCheckpointer();
    console.log("LangGraph: Postgres checkpointer tables ready.");

    // retail_cases starts empty — cases are only ever written by case-extraction.service.ts
    // (LLM extraction from a real credit officer's request), never seeded from fixtures.

    // 2. Neo4j Seeding
    console.log("Initializing Neo4j Graph Databases...");
    const session = getNeo4jSession();

    try {
      // The versioned graph catalog is merged instead of clearing Neo4j on every boot.
      // This preserves externally curated nodes while keeping application-owned nodes
      // and relationships idempotently up to date. Collateral Project nodes are not
      // seeded here — they must be registered from real project guarantee data as
      // loan applications reference them (see policy-rag.service.ts queryProjectGuarantee).
      await seedLegalKnowledgeGraph(session);

      console.log("Neo4j: Seeded versioned documents, clauses, policy rules and gates successfully.");
    } finally {
      await session.close();
    }

    console.log("=== DATABASE SEED PROCESS COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("Error during database seed process:", error);
    throw error;
  }
};
