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

import { getEmergencyMetrics, updateEmergencyGoalTarget } from "./reserves";

describe("reserve actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create or delete emergency goals in read path", async () => {
    const { supabase, calls } = createSupabaseMock({
      responses: {
        "org_members:select:maybeSingle": { data: { org_id: "org-1" } },
        "goals:select:await": { data: [] },
        "accounts:select:await": { data: [] },
      },
    });

    createClientMock.mockResolvedValue(supabase);

    const metrics = await getEmergencyMetrics();

    expect(metrics.goalId).toBeUndefined();
    expect(metrics.targetAmount).toBe(0);

    const goalWrites = calls.filter(
      (call) => call.table === "goals" && (call.action === "insert" || call.action === "update" || call.action === "delete")
    );
    expect(goalWrites).toHaveLength(0);
  });

  it("creates emergency goal when editing target and none exists", async () => {
    const { supabase, calls } = createSupabaseMock({
      responses: {
        "org_members:select:maybeSingle": { data: { org_id: "org-1" } },
        "goals:select:maybeSingle": { data: null },
        "goals:insert:await": { error: null },
      },
    });

    createClientMock.mockResolvedValue(supabase);

    const result = await updateEmergencyGoalTarget({ targetAmount: 15000 });

    expect(result).toEqual({ success: true });

    const insertCall = calls.find((call) => call.table === "goals" && call.action === "insert");
    expect(insertCall).toBeTruthy();
    expect(insertCall?.payload).toMatchObject({
      org_id: "org-1",
      type: "emergency_fund",
      target_amount: 15000,
      strategy: "manual",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/metas");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });
});
