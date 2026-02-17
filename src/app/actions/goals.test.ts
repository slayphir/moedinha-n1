import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { createGoal, getGoals } from "./goals";

describe("goals actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks emergency goal creation via generic goal flow", async () => {
    const { supabase, from } = createSupabaseMock({
      responses: {},
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await createGoal({
      name: "Reserva",
      type: "emergency_fund",
      target_amount: 10000,
    });

    expect(result.error).toContain("Emergency fund goal is managed");
    expect(from).not.toHaveBeenCalled();
  });

  it("returns only one emergency goal in goal listing", async () => {
    const { supabase } = createSupabaseMock({
      responses: {
        "org_members:select:maybeSingle": { data: { org_id: "org-1" } },
        "goals:select:await": {
          data: [
            {
              id: "goal-em-1",
              org_id: "org-1",
              name: "Reserva 1",
              type: "emergency_fund",
              target_amount: 10000,
              target_date: null,
              current_amount: 0,
              reduction_category_id: null,
              reduction_target_pct: null,
              baseline_amount: null,
              strategy: "manual",
              linked_bucket_id: null,
              status: "active",
              created_at: "2026-02-16T10:00:00.000Z",
            },
            {
              id: "goal-em-2",
              org_id: "org-1",
              name: "Reserva 2",
              type: "emergency_fund",
              target_amount: 12000,
              target_date: null,
              current_amount: 0,
              reduction_category_id: null,
              reduction_target_pct: null,
              baseline_amount: null,
              strategy: "manual",
              linked_bucket_id: null,
              status: "active",
              created_at: "2026-02-15T10:00:00.000Z",
            },
            {
              id: "goal-save-1",
              org_id: "org-1",
              name: "Viagem",
              type: "savings",
              target_amount: 5000,
              target_date: null,
              current_amount: 300,
              reduction_category_id: null,
              reduction_target_pct: null,
              baseline_amount: null,
              strategy: "manual",
              linked_bucket_id: null,
              status: "active",
              created_at: "2026-02-14T10:00:00.000Z",
            },
          ],
        },
      },
    });

    createClientMock.mockResolvedValue(supabase);

    const goals = await getGoals();

    const emergencyGoals = goals.filter((goal) => goal.type === "emergency_fund");
    expect(emergencyGoals).toHaveLength(1);
    expect(goals.find((goal) => goal.id === "goal-save-1")).toBeTruthy();
  });
});
