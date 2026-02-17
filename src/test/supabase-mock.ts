import { vi } from "vitest";

type QueryAction = "select" | "insert" | "update" | "delete" | "upsert" | null;
type QueryStage = "await" | "single" | "maybeSingle";

type QueryFilter = {
  op: "eq" | "in" | "is" | "gte" | "lte" | "lt";
  column: string;
  value: unknown;
};

export type QueryCall = {
  table: string;
  action: QueryAction;
  selectColumns?: string;
  payload?: unknown;
  filters: QueryFilter[];
  orders: { column: string; ascending?: boolean }[];
  limitValue?: number;
};

export type MockResponse = {
  data?: unknown;
  error?: { message?: string; code?: string } | null;
};

type MockResponseMap = Record<string, MockResponse>;

type QueryBuilderState = QueryCall;

class QueryBuilder {
  constructor(
    private readonly state: QueryBuilderState,
    private readonly responses: MockResponseMap
  ) {}

  select(columns = "*") {
    if (!this.state.action) {
      this.state.action = "select";
    }
    this.state.selectColumns = columns;
    return this;
  }

  insert(payload: unknown) {
    this.state.action = "insert";
    this.state.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.action = "update";
    this.state.payload = payload;
    return this;
  }

  delete() {
    this.state.action = "delete";
    return this;
  }

  upsert(payload: unknown) {
    this.state.action = "upsert";
    this.state.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ op: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown) {
    this.state.filters.push({ op: "in", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.state.filters.push({ op: "is", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.state.filters.push({ op: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.state.filters.push({ op: "lte", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.state.filters.push({ op: "lt", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.state.orders.push({ column, ascending: options?.ascending });
    return this;
  }

  limit(value: number) {
    this.state.limitValue = value;
    return this;
  }

  async maybeSingle() {
    return this.resolve("maybeSingle");
  }

  async single() {
    return this.resolve("single");
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolve("await")).then(onfulfilled, onrejected);
  }

  private resolve(stage: QueryStage) {
    const key = `${this.state.table}:${this.state.action ?? "select"}:${stage}`;
    const response = this.responses[key];
    if (!response) {
      throw new Error(`Missing mock response for ${key}`);
    }

    return {
      data: response.data ?? null,
      error: response.error ?? null,
    };
  }
}

export function createSupabaseMock(params: {
  responses: MockResponseMap;
  userId?: string | null;
}) {
  const calls: QueryCall[] = [];
  const authUser = params.userId === undefined ? { id: "user-1" } : params.userId ? { id: params.userId } : null;

  const from = vi.fn((table: string) => {
    const state: QueryBuilderState = {
      table,
      action: null,
      filters: [],
      orders: [],
    };
    calls.push(state);
    return new QueryBuilder(state, params.responses);
  });

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: authUser } })),
    },
    from,
  };

  return { supabase, from, calls };
}
