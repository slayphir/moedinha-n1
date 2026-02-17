export interface QuickLogMetrics {
  opened: number;
  saved: number;
  dropoff: number;
  validationErrors: number;
  totalClicks: number;
  totalTtlMs: number;
  autoCategorized: number;
  manualCategoryCorrections: number;
  updatedAt: string;
}

export interface QuickSaveMetricInput {
  ttlMs: number;
  clicks: number;
  autoCategorized: boolean;
  manualCategoryCorrection: boolean;
}

const STORAGE_KEY = "moedinha_n1_quick_log_metrics_v1";

const EMPTY: QuickLogMetrics = {
  opened: 0,
  saved: 0,
  dropoff: 0,
  validationErrors: 0,
  totalClicks: 0,
  totalTtlMs: 0,
  autoCategorized: 0,
  manualCategoryCorrections: 0,
  updatedAt: new Date(0).toISOString(),
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadMetrics(): QuickLogMetrics {
  if (!canUseStorage()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<QuickLogMetrics>;
    return {
      ...EMPTY,
      ...parsed,
    };
  } catch {
    return EMPTY;
  }
}

function saveMetrics(next: QuickLogMetrics) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function updateMetrics(updater: (current: QuickLogMetrics) => QuickLogMetrics) {
  const current = loadMetrics();
  const next = updater(current);
  next.updatedAt = new Date().toISOString();
  saveMetrics(next);
}

export function trackQuickOpen() {
  updateMetrics((current) => ({
    ...current,
    opened: current.opened + 1,
  }));
}

export function trackQuickDropoff() {
  updateMetrics((current) => ({
    ...current,
    dropoff: current.dropoff + 1,
  }));
}

export function trackQuickValidationError() {
  updateMetrics((current) => ({
    ...current,
    validationErrors: current.validationErrors + 1,
  }));
}

export function trackQuickSave(input: QuickSaveMetricInput) {
  updateMetrics((current) => ({
    ...current,
    saved: current.saved + 1,
    totalClicks: current.totalClicks + Math.max(0, input.clicks),
    totalTtlMs: current.totalTtlMs + Math.max(0, input.ttlMs),
    autoCategorized: current.autoCategorized + (input.autoCategorized ? 1 : 0),
    manualCategoryCorrections:
      current.manualCategoryCorrections + (input.manualCategoryCorrection ? 1 : 0),
  }));
}

export function getQuickMetrics(): QuickLogMetrics {
  return loadMetrics();
}

