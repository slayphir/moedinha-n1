import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PLACEHOLDER_VALUES = new Set([
  "https://seu-projeto.supabase.co",
  "sua-anon-key",
  "your-anon-key",
  "",
]);

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

const cwd = process.cwd();
const envLocalPath = join(cwd, ".env.local");
const envPath = join(cwd, ".env");

const merged = {
  ...parseEnvFile(envPath),
  ...parseEnvFile(envLocalPath),
  ...process.env,
};

const url = merged.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const errors = [];

if (!url) {
  errors.push("NEXT_PUBLIC_SUPABASE_URL nao definida.");
} else {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push("NEXT_PUBLIC_SUPABASE_URL deve usar http/https.");
    }
  } catch {
    errors.push("NEXT_PUBLIC_SUPABASE_URL invalida.");
  }
  if (PLACEHOLDER_VALUES.has(url)) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL ainda esta com placeholder.");
  }
}

if (!anonKey) {
  errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY nao definida.");
} else {
  if (PLACEHOLDER_VALUES.has(anonKey)) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY ainda esta com placeholder.");
  }
  if (anonKey.length < 20) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY parece curta/invalida.");
  }
}

if (errors.length > 0) {
  console.error("Env invalido:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Env valido.");
console.log(`- NEXT_PUBLIC_SUPABASE_URL: ${url}`);
console.log("- NEXT_PUBLIC_SUPABASE_ANON_KEY: configurada");

