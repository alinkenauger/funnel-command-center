import type { FunnelData } from "./types";

// ─── CRITICAL FIELDS PER STAGE ────────────────────────────────────────────────
// These are the fields that matter most for generating a meaningful McKinsey report.
// Each field is weighted equally within its stage.

const CRITICAL_FIELDS: Record<keyof FunnelData["stages"], string[]> = {
  traffic: ["monthly_sessions", "bounce_rate", "top_source", "paid_ratio"],
  lead_gen: ["monthly_new_leads", "opt_in_rate", "cost_per_lead"],
  email_sms: ["list_size", "open_rate", "click_rate", "revenue_per_subscriber"],
  sales_conversion: ["monthly_revenue", "aov", "conversion_rate", "cart_abandonment", "refund_rate"],
  ascension: ["repeat_purchase_rate", "ltv_estimated", "upsell_take_rate"],
};

export interface ReadinessResult {
  score: number; // 0–100
  unlocked: boolean; // score >= 70
  filledFields: number;
  totalFields: number;
  stageScores: Record<string, number>; // stage → 0–100
  missingFields: Record<string, string[]>; // stage → missing field names
}

export function computeReadiness(data: FunnelData | null): ReadinessResult {
  if (!data) {
    return {
      score: 0,
      unlocked: false,
      filledFields: 0,
      totalFields: Object.values(CRITICAL_FIELDS).flat().length,
      stageScores: {},
      missingFields: {},
    };
  }

  const stageScores: Record<string, number> = {};
  const missingFields: Record<string, string[]> = {};
  let filledFields = 0;
  let totalFields = 0;

  for (const [stage, fields] of Object.entries(CRITICAL_FIELDS)) {
    const stageMetrics = data.stages[stage as keyof FunnelData["stages"]]?.metrics ?? {};
    const missing: string[] = [];
    let filled = 0;

    for (const field of fields) {
      totalFields++;
      const val = stageMetrics[field];
      if (val !== undefined && val !== null && val !== "") {
        filled++;
        filledFields++;
      } else {
        missing.push(field);
      }
    }

    stageScores[stage] = Math.round((filled / fields.length) * 100);
    missingFields[stage] = missing;
  }

  // Also incorporate data_completeness_percent from business object (0-100)
  // Weight: 70% critical fields, 30% business.data_completeness_percent
  const fieldScore = (filledFields / totalFields) * 100;
  const businessScore = data.business.data_completeness_percent;
  const score = Math.round(fieldScore * 0.7 + businessScore * 0.3);

  return {
    score: Math.min(100, score),
    unlocked: score >= 70,
    filledFields,
    totalFields,
    stageScores,
    missingFields,
  };
}
