import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const env = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

function readEnv() {
  const cwd = process.cwd();
  const envLocalPath = join(cwd, ".env.local");
  const envPath = join(cwd, ".env");
  return {
    ...parseEnvFile(envPath),
    ...parseEnvFile(envLocalPath),
    ...process.env,
  };
}

async function run() {
  const merged = readEnv();
  const url = merged.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = merged.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error("Faltam variaveis. Rode antes: npm run validate:env");
    process.exit(1);
  }

  const endpoint = `${url.replace(/\/$/, "")}/auth/v1/settings`;
  console.log(`Verificando endpoint: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { apikey: anonKey },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Falha na conexao (${response.status}).`);
    if (body) {
      console.error(body.slice(0, 300));
    }
    process.exit(1);
  }

  const settings = await response.json();
  const projectRef = new URL(url).hostname.split(".")[0];
  console.log("Conexao com Supabase OK.");
  console.log(`- Projeto: ${projectRef}`);
  console.log(`- Signup habilitado: ${Boolean(settings.disable_signup) ? "nao" : "sim"}`);
}

run().catch((error) => {
  console.error("Erro inesperado ao testar Supabase:");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

