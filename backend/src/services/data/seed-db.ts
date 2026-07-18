import { pgQuery } from "../../config/pg";
import { supabase } from "../../config/supabase";
import { getNeo4jSession } from "../../config/neo4j";
import { RETAIL_CASES } from "./retail-case-data";
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
        customer_id VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL
      );
    `);

    // Create orchestration_runs table to persist traces in production
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        run_id VARCHAR(50) PRIMARY KEY,
        case_id VARCHAR(50),
        prompt TEXT,
        status VARCHAR(50),
        response_payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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

    // Seed retail cases using Supabase SDK. Wrapped in its own try/catch — each agent
    // already falls back to the static RETAIL_CASES dict when this table can't be read,
    // so a Supabase outage/misconfiguration must not cascade and block the independent
    // Neo4j seeding step below.
    try {
      const casesToInsert = Object.values(RETAIL_CASES).map(rCase => ({
        case_id: rCase.caseId,
        customer_id: rCase.customerId,
        payload: rCase
      }));

      if (process.env.SUPABASE_DB_URL) {
        const { error: seedError } = await supabase
          .from("retail_cases")
          .upsert(casesToInsert, { onConflict: "case_id" });

        if (seedError) {
          throw seedError;
        }
      } else {
        for (const rCase of Object.values(RETAIL_CASES)) {
          await pgQuery(
            `INSERT INTO retail_cases (case_id, customer_id, payload) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (case_id) DO UPDATE SET customer_id = EXCLUDED.customer_id, payload = EXCLUDED.payload`,
            [rCase.caseId, rCase.customerId, JSON.stringify(rCase)]
          );
        }
      }
      console.log(`PostgreSQL/Supabase: Seeded ${Object.keys(RETAIL_CASES).length} retail loan cases successfully.`);
    } catch (err) {
      console.error("Database case seed error, continuing with static RETAIL_CASES fallback:", err);
    }

    // 2. Neo4j Seeding
    console.log("Initializing Neo4j Graph Databases...");
    const session = getNeo4jSession();
    
    try {
      // The versioned graph catalog is merged instead of clearing Neo4j on every boot.
      // This preserves externally curated nodes while keeping application-owned nodes
      // and relationships idempotently up to date.
      await seedLegalKnowledgeGraph(session);

      // Create Collateral Projects
      await session.run(`
        MERGE (p1:Project {projectCode: "VIN-OCEANPARK-3"})
        SET p1.name = "Vinhomes Ocean Park 3",
            p1.developer = "Vingroup",
            p1.isGuaranteedBySHB = true,
            p1.guaranteeContractNo = "SHB-VAP-2025-008",
            p1.evidenceSource = "PROJECT_GUARANTEE_REGISTRY",
            p1.verificationStatus = "DEMO_ONLY",
            p1.lastVerifiedAt = "2026-07-18"
        MERGE (p2:Project {projectCode: "GALAXY-DIRTY-PROJECT"})
        SET p2.name = "Galaxy Complex",
            p2.developer = "Galaxy Group",
            p2.isGuaranteedBySHB = false,
            p2.guaranteeContractNo = "",
            p2.evidenceSource = "PROJECT_GUARANTEE_REGISTRY",
            p2.verificationStatus = "DEMO_ONLY",
            p2.lastVerifiedAt = "2026-07-18"

        WITH p1, p2
        MATCH (c3:Clause {clauseId: "Clause-Future-Property"})
        MATCH (c6:Clause {clauseId: "Clause-LTV-Limit"})

        MERGE (p1)-[:GOVERNED_BY]->(c3)
        MERGE (p2)-[:GOVERNED_BY]->(c3)
        MERGE (p1)-[:GOVERNED_BY]->(c6)
        MERGE (p2)-[:GOVERNED_BY]->(c6)
      `);

      console.log("Neo4j: Seeded versioned documents, clauses, policy rules, gates and property evidence successfully.");
    } finally {
      await session.close();
    }

    console.log("=== DATABASE SEED PROCESS COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("Error during database seed process:", error);
    throw error;
  }
};
