import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv({ path: join(process.cwd(), ".env") });

const yes =
  process.argv.includes("--yes") ||
  process.argv.includes("-y") ||
  process.env.CLEAN_DB_YES === "1";

if (!yes) {
  console.error(
    "Uso: npm run db:clean -- --yes\n" +
      "Isso apaga TODAS as orgs, lançamentos, contas, categorias etc. Mantém usuários (auth) e alert_definitions.",
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL não definida. Cole no .env.local a connection string do Postgres (Supabase: Settings → Database → URI).\n" +
      "Alternativa: execute o arquivo supabase/scripts/clean_app_data.sql no SQL Editor.",
  );
  process.exit(1);
}

const sqlPath = join(__dirname, "..", "supabase", "scripts", "clean_app_data.sql");
const body = readFileSync(sqlPath, "utf8");

const sql = postgres(databaseUrl, {
  ssl: { rejectUnauthorized: false },
  prepare: false,
  max: 1,
});

try {
  await sql.unsafe(body);
  console.log("Banco limpo: dados de aplicação removidos (orgs, transações, etc.).");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
