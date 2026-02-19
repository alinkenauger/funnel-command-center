// ── Drive Ingestion Types ──────────────────────────────────────
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
}

export interface DriveConfig {
  folderId: string;
  folderName?: string;
  connectedAt: string;
  lastSyncedAt?: string;
  knownFileIds: string[];
}

export interface DriveSource {
  file_id: string;
  file_name: string;
  file_link: string;
  stages_referenced: string[];
}

export interface GapQuestion {
  stage: string;
  question: string;
  context: string;
}

export interface FileFinding {
  file_id: string;
  file_name: string;
  file_link: string;
  stages: string[];
  business_hints?: { name?: string; industry?: string; model?: string };
  metrics: Record<string, string | number>;
  strengths: string[];
  weaknesses: string[];
  key_insights: string[];
  missing_data: string[];
}

// ── Core Funnel Types ──────────────────────────────────────────
export interface StageMetrics {
  monthly_sessions?: number;
  bounce_rate?: number;
  top_source?: string;
  paid_ratio?: number;
  monthly_new_leads?: number;
  opt_in_rate?: number;
  cost_per_lead?: number;
  list_size?: number;
  open_rate?: number;
  click_rate?: number;
  revenue_per_subscriber?: number;
  monthly_revenue?: number;
  aov?: number;
  conversion_rate?: number;
  cart_abandonment?: number;
  refund_rate?: number;
  repeat_purchase_rate?: number;
  ltv_estimated?: number;
  upsell_take_rate?: number;
  [key: string]: string | number | undefined;
}

export interface StageData {
  grade: string;
  grade_numeric: number;
  grade_confidence: "high" | "medium" | "low";
  completeness_score: number;
  metrics: StageMetrics;
  strengths: string[];
  weaknesses: string[];
  revenue_opportunity: number;
  sources?: string[]; // file IDs that contributed to this stage
}

export interface FunnelData {
  business: {
    name: string;
    industry: string;
    business_model: string;
    date_range_analyzed?: { start: string; end: string };
    data_completeness_percent: number;
  };
  stages: {
    traffic: StageData;
    lead_gen: StageData;
    email_sms: StageData;
    sales_conversion: StageData;
    ascension: StageData;
  };
  cross_stage: {
    full_funnel_conversion_rate: number;
    revenue_per_visitor: number;
    customer_acquisition_cost: number;
    biggest_bottleneck: string;
    overall_grade: string;
    overall_grade_numeric: number;
    overall_grade_confidence: "high" | "medium" | "low";
    total_revenue_opportunity: number;
  };
  processing_log?: Array<{ timestamp: string; action: string }>;
  // Drive ingestion additions
  sources?: DriveSource[];
  gap_questions?: GapQuestion[];
  drive_folder_id?: string;
  ingested_at?: string;
}

export interface McKinseyReportData {
  generated_at: string;
  executive_summary: {
    situation: string;
    complication: string;
    resolution: string;
  };
  issue_tree: IssueNode;
  financial_model: {
    stages: Array<{
      name: string;
      current_arr: number;
      optimized_arr: number;
      delta: number;
      key_lever: string;
    }>;
    total_current_arr: number;
    total_optimized_arr: number;
    total_delta: number;
  };
  action_plan: Array<{
    sprint: string;
    initiatives: Array<{
      priority: number;
      action: string;
      owner: string;
      success_metric: string;
      effort: "Low" | "Medium" | "High";
    }>;
  }>;
  strategic_assessment: {
    overall_grade: string;
    top_risks: string[];
    top_opportunities: string[];
    confidence: "high" | "medium" | "low";
  };
}

export interface IssueNode {
  label: string;
  type?: "root" | "branch" | "leaf";
  finding?: string;
  children?: IssueNode[];
}
