"use client";

import { useState } from "react";
import {
  Signal,
  Target,
  Mail,
  DollarSign,
  TrendingUp,
  LayoutDashboard,
  GitBranch,
  Layers,
  AlertCircle,
  FileText,
  Upload,
  ChevronRight,
  ChevronDown,
  Activity,
  RefreshCw,
  LogOut,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import type { FunnelData, StageData } from "@/lib/types";
import type { McKinseyReportData } from "@/lib/types";
import FunnelFlow from "@/components/FunnelFlow";

// ─── STAGE CONFIGURATION ─────────────────────────────────────────────────────

const STAGE_CONFIG = [
  {
    key: "traffic" as const,
    label: "Traffic",
    Icon: Signal,
    description: "Paid, organic, social, YouTube",
    weight: 0.15,
  },
  {
    key: "lead_gen" as const,
    label: "Lead Gen",
    Icon: Target,
    description: "Opt-ins, landing pages, lead magnets",
    weight: 0.2,
  },
  {
    key: "email_sms" as const,
    label: "Email & SMS",
    Icon: Mail,
    description: "List health, sequences, broadcasts",
    weight: 0.2,
  },
  {
    key: "sales_conversion" as const,
    label: "Sales",
    Icon: DollarSign,
    description: "Revenue, conversion, AOV, checkout",
    weight: 0.25,
  },
  {
    key: "ascension" as const,
    label: "Ascension",
    Icon: TrendingUp,
    description: "LTV, upsells, retention, referrals",
    weight: 0.2,
  },
];

type StageKey = (typeof STAGE_CONFIG)[number]["key"];
type NavView = "overview" | "flow" | "stages" | "gaps" | "strategy";

// ─── GRADE UTILITIES ──────────────────────────────────────────────────────────

function gradeColor(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "text-emerald-400";
  if (g.startsWith("B")) return "text-sky-400";
  if (g.startsWith("C")) return "text-amber-400";
  if (g.startsWith("D")) return "text-orange-400";
  return "text-red-400";
}

function gradeBorderColor(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "border-emerald-500/40";
  if (g.startsWith("B")) return "border-sky-500/40";
  if (g.startsWith("C")) return "border-amber-500/40";
  if (g.startsWith("D")) return "border-orange-500/40";
  return "border-red-500/40";
}

function gradeBarColor(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "bg-emerald-500";
  if (g.startsWith("B")) return "bg-sky-500";
  if (g.startsWith("C")) return "bg-amber-500";
  if (g.startsWith("D")) return "bg-orange-500";
  return "bg-red-500";
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function GradeDisplay({
  grade,
  numeric,
  size = "md",
}: {
  grade: string;
  numeric: number;
  size?: "sm" | "md" | "lg";
}) {
  const textSize = size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base";
  const barColor = gradeBarColor(grade);
  const textColor = gradeColor(grade);

  return (
    <div className="flex flex-col gap-1">
      <span className={`font-mono font-bold tabular-nums ${textSize} ${textColor}`}>
        {grade}
      </span>
      <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${numeric}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums">{numeric}/100</span>
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles = {
    high: { dot: "bg-emerald-400", label: "High" },
    medium: { dot: "bg-amber-400", label: "Medium" },
    low: { dot: "bg-red-400", label: "Low" },
  };
  const s = styles[confidence] || styles.low;
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label} confidence
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-zinc-500";

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="flex items-end gap-2">
        <div className="text-2xl font-bold tabular-nums text-zinc-100">{value}</div>
        {trend && (
          <div className={`mb-0.5 ${trendColor}`}>
            <TrendIcon size={16} />
          </div>
        )}
      </div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function CompletenessBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">{score}%</span>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      {sub && <p className="text-sm text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── STAGE METRICS TABLE ──────────────────────────────────────────────────────

function formatMetricValue(key: string, value: string | number | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  const pctKeys = [
    "bounce_rate",
    "opt_in_rate",
    "paid_ratio",
    "open_rate",
    "click_rate",
    "conversion_rate",
    "cart_abandonment",
    "refund_rate",
    "repeat_purchase_rate",
    "upsell_take_rate",
    "full_funnel_conversion_rate",
  ];
  const currencyKeys = [
    "cost_per_lead",
    "monthly_revenue",
    "aov",
    "revenue_per_subscriber",
    "ltv_estimated",
    "revenue_per_visitor",
    "customer_acquisition_cost",
    "revenue_opportunity",
    "total_revenue_opportunity",
  ];
  const numericKeys = ["monthly_sessions", "monthly_new_leads", "list_size"];

  if (pctKeys.includes(key)) return `${(value * 100).toFixed(1)}%`;
  if (currencyKeys.includes(key)) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  if (numericKeys.includes(key)) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  }
  return String(value);
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    monthly_sessions: "Monthly Sessions",
    bounce_rate: "Bounce Rate",
    top_source: "Top Source",
    paid_ratio: "Paid Traffic Ratio",
    monthly_new_leads: "Monthly New Leads",
    opt_in_rate: "Opt-In Rate",
    cost_per_lead: "Cost per Lead",
    list_size: "List Size",
    open_rate: "Open Rate",
    click_rate: "Click Rate",
    revenue_per_subscriber: "Revenue / Subscriber",
    monthly_revenue: "Monthly Revenue",
    aov: "Avg Order Value",
    conversion_rate: "Conversion Rate",
    cart_abandonment: "Cart Abandonment",
    refund_rate: "Refund Rate",
    repeat_purchase_rate: "Repeat Purchase Rate",
    ltv_estimated: "Estimated LTV",
    upsell_take_rate: "Upsell Take Rate",
  };
  return labels[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: FunnelData }) {
  const { business, stages, cross_stage } = data;
  const fmt = {
    currency: (n: number) =>
      n >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`,
    pct: (n: number) => `${(n * 100).toFixed(2)}%`,
  };

  return (
    <div className="space-y-8">
      {/* Cross-stage KPIs */}
      <div>
        <SectionHeader title="Funnel Performance" sub="Key cross-stage metrics" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Full-Funnel CVR"
            value={fmt.pct(cross_stage.full_funnel_conversion_rate)}
            sub="Visitor → Customer"
          />
          <StatCard
            label="Revenue / Visitor"
            value={`$${cross_stage.revenue_per_visitor.toFixed(2)}`}
            sub="Blended across all traffic"
          />
          <StatCard
            label="CAC"
            value={`$${cross_stage.customer_acquisition_cost}`}
            sub="Customer acquisition cost"
          />
          <StatCard
            label="Revenue Opportunity"
            value={fmt.currency(cross_stage.total_revenue_opportunity)}
            sub="Identified upside / yr"
            trend="up"
          />
        </div>
      </div>

      {/* Stage summary grid */}
      <div>
        <SectionHeader
          title="Stage Scorecard"
          sub={`Biggest bottleneck: ${cross_stage.biggest_bottleneck.replace(/_/g, " ")}`}
        />
        <div className="space-y-2">
          {STAGE_CONFIG.map(({ key, label, Icon }) => {
            const stage = stages[key] as StageData;
            const isBottleneck = key === cross_stage.biggest_bottleneck;
            return (
              <div
                key={key}
                className={`flex items-center gap-4 bg-zinc-900 border rounded-lg px-4 py-3 ${
                  isBottleneck ? "border-amber-500/40" : "border-zinc-700/50"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                    isBottleneck ? "bg-amber-500/10" : "bg-zinc-800"
                  }`}
                >
                  <Icon
                    size={16}
                    className={isBottleneck ? "text-amber-400" : "text-zinc-400"}
                  />
                </div>

                <div className="flex-shrink-0 w-24">
                  <div className="text-sm font-medium text-zinc-200">{label}</div>
                  {isBottleneck && (
                    <div className="text-xs text-amber-500 mt-0.5">Biggest bottleneck</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <CompletenessBar score={stage.completeness_score} />
                  <div className="text-xs text-zinc-600 mt-0.5">
                    {stage.completeness_score}% data completeness
                  </div>
                </div>

                <div className="flex-shrink-0 w-20 text-right">
                  <GradeDisplay grade={stage.grade} numeric={stage.grade_numeric} size="sm" />
                </div>

                <div className="flex-shrink-0 w-28 text-right">
                  <div className="text-xs text-zinc-400">Opportunity</div>
                  <div className="text-sm font-semibold text-emerald-400 tabular-nums">
                    +
                    {stage.revenue_opportunity >= 1000
                      ? `$${(stage.revenue_opportunity / 1000).toFixed(0)}K`
                      : `$${stage.revenue_opportunity}`}
                    /yr
                  </div>
                </div>

                <div className="flex-shrink-0 w-32">
                  <ConfidenceDot confidence={stage.grade_confidence} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data completeness note */}
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-4 flex items-start gap-3">
        <Activity size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-zinc-200 mb-0.5">
            Overall Data Completeness: {business.data_completeness_percent}%
          </div>
          <div className="text-xs text-zinc-500">
            {business.data_completeness_percent < 70
              ? `Need ${70 - business.data_completeness_percent}% more data to unlock full McKinsey Assessment report. Upload more source files or fill in metrics manually.`
              : "Sufficient data captured. McKinsey Assessment report is available."}
          </div>
          <div className="mt-2">
            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden w-64">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  business.data_completeness_percent >= 70
                    ? "bg-indigo-500"
                    : "bg-zinc-500"
                }`}
                style={{ width: `${business.data_completeness_percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STAGES TAB ───────────────────────────────────────────────────────────────

function StagesTab({ data }: { data: FunnelData }) {
  const [expanded, setExpanded] = useState<StageKey | null>(STAGE_CONFIG[0].key);

  return (
    <div className="space-y-3">
      {STAGE_CONFIG.map(({ key, label, Icon, description }) => {
        const stage = data.stages[key] as StageData;
        const isOpen = expanded === key;

        return (
          <div
            key={key}
            className={`bg-zinc-900 border rounded-lg overflow-hidden transition-all ${gradeBorderColor(stage.grade)}`}
          >
            {/* Accordion header */}
            <button
              onClick={() => setExpanded(isOpen ? null : key)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex-shrink-0 w-9 h-9 bg-zinc-800 rounded-lg flex items-center justify-center">
                <Icon size={16} className="text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">{label}</span>
                  <span className="text-xs text-zinc-500">{description}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <CompletenessBar score={stage.completeness_score} />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <GradeDisplay grade={stage.grade} numeric={stage.grade_numeric} size="sm" />
                <ChevronDown
                  size={16}
                  className={`text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-zinc-700/50 px-5 py-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Metrics */}
                  <div>
                    <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
                      Metrics
                    </div>
                    <div className="space-y-2">
                      {Object.entries(stage.metrics)
                        .filter(([, v]) => v !== undefined)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between py-1.5 border-b border-zinc-800"
                          >
                            <span className="text-xs text-zinc-500">{metricLabel(k)}</span>
                            <span className="text-xs font-mono tabular-nums text-zinc-200">
                              {formatMetricValue(k, v)}
                            </span>
                          </div>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Revenue opportunity</span>
                      <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                        +
                        {stage.revenue_opportunity >= 1000
                          ? `$${(stage.revenue_opportunity / 1000).toFixed(0)}K`
                          : `$${stage.revenue_opportunity}`}
                        /yr
                      </span>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                        Strengths
                      </div>
                      <ul className="space-y-1.5">
                        {stage.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                            <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                        Weaknesses
                      </div>
                      <ul className="space-y-1.5">
                        {stage.weaknesses.map((w, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                            <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ConfidenceDot confidence={stage.grade_confidence} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── GAPS TAB ─────────────────────────────────────────────────────────────────

function GapsTab({ data }: { data: FunnelData }) {
  const { stages, cross_stage } = data;

  // Collect all weaknesses across stages, sorted by revenue opportunity
  const allGaps = STAGE_CONFIG.flatMap(({ key, label, Icon }) => {
    const stage = stages[key] as StageData;
    return stage.weaknesses.map((w) => ({
      stage: label,
      Icon,
      weakness: w,
      opportunity: stage.revenue_opportunity,
      grade: stage.grade,
    }));
  }).sort((a, b) => b.opportunity - a.opportunity);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Identified Gaps"
        sub={`${allGaps.length} gaps found · Sorted by revenue opportunity`}
      />

      {/* Bottleneck callout */}
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 flex items-start gap-3">
        <Zap size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-amber-300 mb-0.5">
            Primary Bottleneck:{" "}
            {cross_stage.biggest_bottleneck.replace(/_/g, " ").replace(/\b\w/g, (c) =>
              c.toUpperCase()
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Focus optimization efforts here first for highest leverage ROI.
          </div>
        </div>
      </div>

      {/* Gap list */}
      <div className="space-y-2">
        {allGaps.map((gap, i) => {
          const { Icon } = gap;
          return (
            <div
              key={i}
              className="flex items-center gap-4 bg-zinc-900 border border-zinc-700/50 rounded-lg px-4 py-3"
            >
              <span className="flex-shrink-0 w-6 text-xs text-zinc-600 tabular-nums text-right">
                {i + 1}
              </span>
              <div className="flex-shrink-0 w-7 h-7 bg-zinc-800 rounded-md flex items-center justify-center">
                <Icon size={13} className="text-zinc-400" />
              </div>
              <div className="flex-shrink-0 w-20">
                <span className="text-xs text-zinc-500">{gap.stage}</span>
              </div>
              <div className="flex-1 text-sm text-zinc-300">{gap.weakness}</div>
              <div className="flex-shrink-0 text-right">
                <div className="text-xs text-zinc-600">Opportunity</div>
                <div className="text-sm font-semibold text-emerald-400 tabular-nums">
                  +
                  {gap.opportunity >= 1000
                    ? `$${(gap.opportunity / 1000).toFixed(0)}K`
                    : `$${gap.opportunity}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── STRATEGY TAB ─────────────────────────────────────────────────────────────

function StrategyTab({ data }: { data: FunnelData }) {
  const { stages, cross_stage } = data;

  // Build prioritized recommendations
  const recommendations = STAGE_CONFIG.map(({ key, label, Icon }) => {
    const stage = stages[key] as StageData;
    const isBottleneck = key === cross_stage.biggest_bottleneck;
    const effort = stage.grade_numeric < 60 ? "High" : stage.grade_numeric < 75 ? "Medium" : "Low";
    const impact =
      stage.revenue_opportunity >= 150000
        ? "High"
        : stage.revenue_opportunity >= 75000
        ? "Medium"
        : "Low";
    return { key, label, Icon, stage, isBottleneck, effort, impact };
  }).sort((a, b) => b.stage.revenue_opportunity - a.stage.revenue_opportunity);

  const effortColor = (e: string) =>
    e === "Low" ? "text-emerald-400" : e === "Medium" ? "text-amber-400" : "text-red-400";
  const impactColor = (i: string) =>
    i === "High" ? "text-emerald-400" : i === "Medium" ? "text-amber-400" : "text-zinc-500";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Strategic Priorities"
        sub="Ranked by revenue opportunity · Generate full McKinsey Assessment for detailed 90-day plan"
      />

      {/* Revenue waterfall summary */}
      <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-5">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Revenue Opportunity Waterfall
        </div>
        <div className="space-y-3">
          {recommendations.map(({ key, label, Icon, stage }) => {
            const pct =
              (stage.revenue_opportunity / cross_stage.total_revenue_opportunity) * 100;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-zinc-800 rounded flex items-center justify-center">
                  <Icon size={12} className="text-zinc-400" />
                </div>
                <div className="flex-shrink-0 w-24 text-xs text-zinc-400">{label}</div>
                <div className="flex-1 h-5 bg-zinc-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-indigo-600/60 border-r border-indigo-500 rounded transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex-shrink-0 w-16 text-right text-xs font-mono tabular-nums text-emerald-400">
                  +
                  {stage.revenue_opportunity >= 1000
                    ? `$${(stage.revenue_opportunity / 1000).toFixed(0)}K`
                    : `$${stage.revenue_opportunity}`}
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-zinc-700 flex justify-between">
            <span className="text-xs text-zinc-400">Total identified opportunity</span>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              +
              {cross_stage.total_revenue_opportunity >= 1000000
                ? `$${(cross_stage.total_revenue_opportunity / 1000000).toFixed(1)}M`
                : `$${(cross_stage.total_revenue_opportunity / 1000).toFixed(0)}K`}
              /yr
            </span>
          </div>
        </div>
      </div>

      {/* Priority table */}
      <div>
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
          Action Priority Matrix
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500">Stage</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500">Grade</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500">
                  Opportunity
                </th>
                <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500">Impact</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500">Effort</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map(({ key, label, Icon, stage, isBottleneck, effort, impact }) => (
                <tr key={key} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <Icon size={13} className="text-zinc-500" />
                      <span className="text-zinc-200">{label}</span>
                      {isBottleneck && (
                        <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5">
                          Bottleneck
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className={`font-mono font-bold ${gradeColor(stage.grade)}`}>
                      {stage.grade}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-emerald-400 tabular-nums">
                    +
                    {stage.revenue_opportunity >= 1000
                      ? `$${(stage.revenue_opportunity / 1000).toFixed(0)}K`
                      : `$${stage.revenue_opportunity}`}
                  </td>
                  <td className={`py-3 px-3 ${impactColor(impact)}`}>{impact}</td>
                  <td className={`py-3 px-3 ${effortColor(effort)}`}>{effort}</td>
                  <td className="py-3 px-3">
                    <ConfidenceDot confidence={stage.grade_confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface FunnelDashboardProps {
  data: FunnelData;
  onRefresh?: () => void;
  onUploadClick?: () => void;
  onReportClick?: () => void;
  onLogout?: () => void;
  report?: McKinseyReportData | null;
  readinessScore?: number;
  isGeneratingReport?: boolean;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function FunnelDashboard({
  data,
  onRefresh,
  onUploadClick,
  onReportClick,
  onLogout,
  readinessScore = 0,
  isGeneratingReport = false,
}: FunnelDashboardProps) {
  const [activeView, setActiveView] = useState<NavView>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { business, cross_stage } = data;

  const navItems: { id: NavView; label: string; Icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", Icon: LayoutDashboard },
    { id: "flow", label: "Funnel Flow", Icon: GitBranch },
    { id: "stages", label: "Stages", Icon: Layers },
    { id: "gaps", label: "Gaps", Icon: AlertCircle },
    { id: "strategy", label: "Strategy", Icon: Target },
  ];

  const reportUnlocked = readinessScore >= 70;

  const renderContent = () => {
    switch (activeView) {
      case "overview":
        return <OverviewTab data={data} />;
      case "flow":
        return <FunnelFlow data={data} />;
      case "stages":
        return <StagesTab data={data} />;
      case "gaps":
        return <GapsTab data={data} />;
      case "strategy":
        return <StrategyTab data={data} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── SIDEBAR ── */}
      <aside
        className={`flex-shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-900 transition-all duration-300 ${
          sidebarCollapsed ? "w-14" : "w-56"
        }`}
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-zinc-800">
          <div className="flex-shrink-0 w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center">
            <Activity size={14} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100 truncate">
                {business.name}
              </div>
              <div className="text-xs text-zinc-500 truncate">{business.industry}</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map(({ id, label, Icon }) => {
            const isActive = activeView === id;
            return (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
                }`}
              >
                <Icon size={15} className="flex-shrink-0" />
                {!sidebarCollapsed && <span>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar actions */}
        <div className="p-2 border-t border-zinc-800 space-y-0.5">
          {onUploadClick && (
            <button
              onClick={onUploadClick}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
            >
              <Upload size={15} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>Upload Files</span>}
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
            >
              <LogOut size={15} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>Sign out</span>}
            </button>
          )}
          {/* Toggle collapse */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <ChevronRight
              size={13}
              className={`flex-shrink-0 transition-transform ${sidebarCollapsed ? "" : "rotate-180"}`}
            />
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex-shrink-0 flex items-center gap-4 px-6 py-3 border-b border-zinc-800 bg-zinc-900">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-zinc-400 min-w-0">
            <span className="text-zinc-500">Funnel CC</span>
            <ChevronRight size={13} className="text-zinc-600 flex-shrink-0" />
            <span className="text-zinc-200 font-medium">
              {navItems.find((n) => n.id === activeView)?.label}
            </span>
          </div>

          <div className="flex-1" />

          {/* Overall grade + completeness */}
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-xs text-zinc-500 mb-1">Data readiness</div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      readinessScore >= 70 ? "bg-indigo-500" : "bg-zinc-500"
                    }`}
                    style={{ width: `${readinessScore}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-zinc-400">{readinessScore}%</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-zinc-500 mb-1">Overall grade</div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-lg font-mono font-bold tabular-nums ${gradeColor(cross_stage.overall_grade)}`}
                >
                  {cross_stage.overall_grade}
                </span>
                <ConfidenceDot confidence={cross_stage.overall_grade_confidence} />
              </div>
            </div>

            {/* Refresh */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={14} />
              </button>
            )}

            {/* Report CTA */}
            {onReportClick && (
              <button
                onClick={reportUnlocked ? onReportClick : undefined}
                disabled={!reportUnlocked || isGeneratingReport}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  reportUnlocked
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/50"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                }`}
                title={
                  reportUnlocked
                    ? "Generate McKinsey Assessment"
                    : `Need ${70 - readinessScore}% more data to unlock`
                }
              >
                {isGeneratingReport ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <FileText size={13} />
                    {reportUnlocked ? "Assessment" : `${readinessScore}% — Locked`}
                  </>
                )}
              </button>
            )}
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-5xl mx-auto">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
}
