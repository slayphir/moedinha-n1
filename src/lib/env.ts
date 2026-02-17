import { z } from "zod";

const PLACEHOLDER_VALUES = new Set([
  "https://seu-projeto.supabase.co",
  "sua-anon-key",
  "your-anon-key",
  "",
]);

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ required_error: "NEXT_PUBLIC_SUPABASE_URL nao definida." })
    .url("NEXT_PUBLIC_SUPABASE_URL invalida."),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ required_error: "NEXT_PUBLIC_SUPABASE_ANON_KEY nao definida." })
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY parece invalida."),
  CRON_SECRET: z.string().min(12, "CRON_SECRET muito curta.").optional(),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => issue.message).join(" ");
  throw new Error(`Variaveis de ambiente invalidas. ${details}`);
}

if (
  PLACEHOLDER_VALUES.has(parsed.data.NEXT_PUBLIC_SUPABASE_URL) ||
  PLACEHOLDER_VALUES.has(parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY)
) {
  throw new Error(
    "Variaveis de ambiente com placeholders. Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY reais."
  );
}

export const env = parsed.data;

