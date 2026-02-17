export type TransactionType = "income" | "expense" | "transfer";
export type TransactionStatus = "pending" | "cleared" | "reconciled" | "cancelled";
export type MemberRole = "admin" | "financeiro" | "leitura";

export interface Org {
  id: string;
  name: string;
  slug: string;
  telegram_config: {
    chat_id: string;
    is_active: boolean;
    preferences: {
      daily_summary: boolean;
      bill_reminder: boolean;
    };
  } | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Account {
  id: string;
  org_id: string;
  name: string;
  type: string;
  currency: string;
  initial_balance: number;
  is_active: boolean;
  is_credit_card?: boolean;
  credit_limit?: number;
  closing_day?: number;
  due_day?: number;
  created_at: string;
  updated_at: string;
}

export type BaseIncomeMode = "current_month" | "avg_3m" | "avg_6m" | "planned_manual";
export type DistributionEditMode = "auto" | "manual";
export type AlertSeverity = "info" | "warn" | "critical";

export interface Category {
  id: string;
  org_id: string;
  name: string;
  type: TransactionType;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  default_bucket_id: string | null;
  created_at: string;
}

export interface Tag {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  org_id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  account_id: string;
  transfer_account_id: string | null;
  category_id: string | null;
  bucket_id: string | null;
  description: string | null;
  date: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  account?: Account;
  category?: Category;
  tags?: Tag[];
}

export interface Distribution {
  id: string;
  org_id: string;
  name: string;
  is_default: boolean;
  mode: DistributionEditMode;
  base_income_mode: BaseIncomeMode;
  planned_income: number | null;
  active_from: string | null;
  active_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface DistributionBucket {
  id: string;
  distribution_id: string;
  name: string;
  percent_bps: number;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_flexible: boolean;
  created_at: string;
}

export interface MonthSnapshotBucketData {
  bucket_id: string;
  budget: number;
  spend: number;
  spend_pct: number;
  pace_ideal: number;
  projection: number;
}

export interface MonthSnapshot {
  id: string;
  org_id: string;
  month: string;
  base_income: number;
  base_income_mode: BaseIncomeMode;
  bucket_data: MonthSnapshotBucketData[];
  day_ratio: number | null;
  total_spend: number | null;
  total_budget: number | null;
  computed_at: string;
}

export interface AlertDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  severity: AlertSeverity;
  condition_expression: string | null;
  cooldown_hours: number;
  hysteresis_pct: number;
  message_template: string;
  cta_primary: string | null;
  cta_secondary: string | null;
  channels: string[];
}

export interface Alert {
  id: string;
  org_id: string;
  user_id: string | null;
  month: string;
  alert_code: string;
  severity: AlertSeverity;
  message: string;
  context_json: Record<string, unknown>;
  cta_primary: string | null;
  cta_secondary: string | null;
  created_at: string;
  acknowledged_at: string | null;
  snoozed_until: string | null;
}

export interface RecurringRule {
  id: string;
  org_id: string;
  description: string;
  amount: number;
  account_id: string;
  category_id: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  day_of_month: number | null;
  day_of_week: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  org_id: string;
  category_id: string;
  month: string;
  amount: number;
  alert_threshold: number;
  created_at: string;
  updated_at: string;
}
