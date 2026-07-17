import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  fptApiKey: process.env.FPT_API_KEY || "",
  fptBaseUrl: process.env.FPT_BASE_URL || "https://mkp-api.fptcloud.com",
  fptModel: process.env.FPT_MODEL || "gemma-3-27b-it",
  modelGatewayEnabled: process.env.MODEL_GATEWAY_ENABLED !== "false",
};
