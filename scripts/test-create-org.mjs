/**
 * Testa se SUPABASE_SERVICE_ROLE_KEY está carregada e createAdminClient funciona.
 * Rode: node scripts/test-create-org.mjs
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(__dirname, "..", "..", ".env");

const { parsed } = config({ path: rootEnvPath });
const serviceKey = parsed?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = parsed?.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

console.log("Root .env path:", rootEnvPath);
console.log("SUPABASE_SERVICE_ROLE_KEY:", serviceKey ? `${serviceKey.slice(0, 15)}...` : "NAO ENCONTRADA");
console.log("NEXT_PUBLIC_SUPABASE_URL:", url || "NAO ENCONTRADA");

if (!serviceKey || !url) {
  console.error("\nFalha: variaveis ausentes. Verifique o .env na raiz (Moedinha N1).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Teste: listar orgs (service role bypassa RLS)
const { data, error } = await admin.from("orgs").select("id, name").limit(1);

if (error) {
  console.error("\nErro ao conectar:", error.message);
  process.exit(1);
}

console.log("\nOK: Admin client conectou. Orgs existentes:", data?.length ?? 0);
