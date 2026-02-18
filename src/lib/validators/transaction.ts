import { z } from "zod";

export const transactionSchema = z
  .object({
    description: z.string().trim().optional().default(""),
    amount: z.coerce.number().min(0.01, "Informe um valor maior que zero"),
    type: z.enum(["income", "expense", "transfer"]),
    accountId: z.string().uuid("Selecione uma conta"),
    categoryId: z.string().uuid().optional().nullable(),
    date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Data invalida"),

    dueDate: z.string().optional().nullable(),
    isPaid: z.boolean().default(true),

    transferAccountId: z.string().uuid().optional().nullable(),

    isInstallment: z.boolean().default(false),
    installments: z.coerce.number().min(2, "Minimo de 2 parcelas").optional().nullable(),

    isRecurring: z.boolean().default(false),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional().nullable(),
    endDate: z.string().optional().nullable(),

    contactId: z.string().optional().nullable(),
    tags: z.array(z.string()).default([]),

    interestAmount: z.coerce.number().min(0).optional().nullable(),
    fineAmount: z.coerce.number().min(0).optional().nullable(),
    payPastInstallments: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.type === "transfer" && !data.transferAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conta de destino e obrigatoria para transferencias",
        path: ["transferAccountId"],
      });
    }
    if (data.type === "transfer" && data.accountId === data.transferAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conta de destino deve ser diferente da conta de origem",
        path: ["transferAccountId"],
      });
    }
    if (data.isInstallment && !data.installments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o numero de parcelas",
        path: ["installments"],
      });
    }
    if (data.isRecurring && !data.frequency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a frequencia",
        path: ["frequency"],
      });
    }
  });

export type TransactionFormValues = z.infer<typeof transactionSchema>;

