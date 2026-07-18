import dotenv from "dotenv";
import { Pool } from "pg";

// Loaded here (not just in config/env.ts) so pgPool's connection string is correct
// regardless of which module happens to import this file first in the dependency graph.
dotenv.config();

<<<<<<< HEAD
if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is required; Postgres now always connects through Supabase.");
}

export const pgPool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 500,
  connectionTimeoutMillis: 5000,
});
=======
export const pgPool = process.env.SUPABASE_DB_URL 
  ? new Pool({ 
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : new Pool({
      host: pgHost,
      port: pgPort,
      user: pgUser,
      password: pgPassword,
      database: pgDatabase,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
>>>>>>> bd85b9d454800c978eddaf7d70e3f23ab1d22ad9

pgPool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export const pgQuery = async (text: string, params?: any[]) => {
  return pgPool.query(text, params);
};
