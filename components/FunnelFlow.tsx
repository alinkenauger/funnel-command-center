"use client";

import { useState } from "react";
import { Signal, Target, Mail, DollarSign, TrendingUp, X } from "lucide-react";
import type { FunnelData, StageData } from "@/lib/types";

// ─── STAGE CONFIG ─────────────────────────────────────────────────────────────

const STAGE_CONFIG = [
  {
    key: "traffic" as const,
    label: "Traffic",
    sub: "Awareness",
    Icon: Signal,
  },
  {
    key: "lead_gen" as const,
    label: "Lead Gen",
    sub: "Capture",
    Icon: Target,
  },
  {
    key: "email_sms" as const,
    label: "Email & SMS",
    sub: "Nurture",
    Icon: Mail,
  },
  {
    key: "sales_conversion" as const,
    label: "Sales",
    sub: "Convert",
    Icon: DollarSign,
  },
  {
    key: "ascension" as const,
    label: "Ascension",
    sub: "Retain",
    Icon: TrendingUp,
  },
];

type StageKey = (typeof STAGE_CONFIG)[number]["key"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function gradeTextColor(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "#34d399"; // emerald-400
  if (g.startsWith("B")) return "#38bdf8"; // sky-400
  if (g.startsWith("C")) return "#fbbf24"; // amber-400
  if (g.startsWith("D")) return "#fb923c"; // orange-400
  return "#f87171"; // red-400
}

function gradeBorderHex(grade: string): string {
  const g = grade.toUpperCase();
  if (g.startsWith("A")) return "#10b981"; // emerald-500
  if (g.startsWith("B")) return "#0ea5e9"; // sky-500
  if (g.startsWith("C")) return "#f59e0b"; // amber-500
  if (g.startsWith("D")) return "#f97316"; // orange-500
  return "#ef4444"; // red-500
}


function formatMetricValue(key: string, value: string | number | undefined): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  const pctKeys = [
    "bounce_rate", "opt_in_rate", "paid_ratio", "open_rate", "click_rate",
    "conversion_rate", "cart_abandonment", "refund_rate", "repeat_purchase_rate",
    "upsell_take_rate",
  ];
  const currencyKeys = [
    "cost_per_lead", "monthly_revenue", "aov", "revenue_per_subscriber",
    "ltv_estimated", "revenue_per_visitor", "customer_acquisition_cost",
  ];
  if (pctKeys.includes(key)) return `${(value * 100).toFixed(1)}%`;
  if (currencyKeys.includes(key)) {
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    monthly_sessions: "Sessions/mo",
    bounce_rate: "Bounce Rate",
    top_source: "Top Source",
    paid_ratio: "Paid Ratio",
    monthly_new_leads: "Leads/mo",
    opt_in_rate: "Opt-In Rate",
    cost_per_lead: "CPL",
    list_size: "List Size",
    open_rate: "Open Rate",
    click_rate: "CTR",
    revenue_per_subscriber: "Rev/Sub",
    monthly_revenue: "Revenue/mo",
    aov: "AOV",
    conversion_rate: "CVR",
    cart_abandonment: "Cart Abandon",
    refund_rate: "Refund Rate",
    repeat_purchase_rate: "Repeat Rate",
    ltv_estimated: "Est. LTV",
    upsell_take_rate: "Upsell Rate",
  };
  return labels[key] || key.replace(/_/g, " ");
}

// ─── CONNECTOR COMPONENT ──────────────────────────────────────────────────────

interface ConnectorProps {
  fromGrade: string;
  toGrade: string;
  dropPct: number; // 0–100, how much drops off between stages
  isHighlighted: boolean;
  onHover: (v: boolean) => void;
  tooltipText: string;
}

function Connector({ fromGrade, toGrade, dropPct, isHighlighted, onHover, tooltipText }: ConnectorProps) {
  // Arrow height proportional to surviving traffic: lower drop-off = taller arrow
  const survivorPct = 100 - dropPct;
  const arrowH = Math.max(4, Math.round(survivorPct * 0.4)); // 4–40px

  return (
    <div
      className="relative flex flex-col items-center justify-center group"
      style={{ width: 48, flexShrink: 0 }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Animated flow line */}
      <svg
        width={48}
        height={80}
        viewBox="0 0 48 80"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={`conn-${fromGrade}-${toGrade}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradeBorderHex(fromGrade)} stopOpacity={0.6} />
            <stop offset="100%" stopColor={gradeBorderHex(toGrade)} stopOpacity={0.6} />
          </linearGradient>
          <marker
            id={`arrow-${fromGrade}`}
            markerWidth="6"
            markerHeight="6"
            refX="3"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill={gradeBorderHex(toGrade)} opacity={0.6} />
          </marker>
        </defs>
        {/* Flow path */}
        <path
          d={`M 2 40 C 24 40, 24 40, 46 40`}
          stroke={`url(#conn-${fromGrade}-${toGrade})`}
          strokeWidth={arrowH}
          fill="none"
          markerEnd={`url(#arrow-${fromGrade})`}
          className={`flow-connector transition-all duration-300 ${isHighlighted ? "opacity-100" : "opacity-40"}`}
        />
        {/* Drop-off indicator line */}
        {dropPct > 5 && (
          <line
            x1={24}
            y1={40 - arrowH / 2 - 2}
            x2={24}
            y2={10}
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="2,2"
            opacity={isHighlighted ? 0.8 : 0.2}
          />
        )}
      </svg>

      {/* Tooltip */}
      {isHighlighted && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mt-[-6px] bg-zinc-800 border border-zinc-600 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg z-10">
          <div className="text-red-400 font-mono">{dropPct.toFixed(0)}% drop-off</div>
          <div className="text-zinc-400">{tooltipText}</div>
        </div>
      )}
    </div>
  );
}

// ─── STAGE NODE ───────────────────────────────────────────────────────────────

interface StageNodeProps {
  config: (typeof STAGE_CONFIG)[number];
  stage: StageData;
  isSelected: boolean;
  isBottleneck: boolean;
  onClick: () => void;
}

function StageNode({ config, stage, isSelected, isBottleneck, onClick }: StageNodeProps) {
  const { Icon, label, sub } = config;
  const borderColor = isSelected
    ? "#6366f1" // indigo
    : isBottleneck
    ? "#f59e0b" // amber
    : gradeBorderHex(stage.grade);

  const topMetricKey = Object.keys(stage.metrics).filter(
    (k) => stage.metrics[k] !== undefined
  )[0];
  const topMetricValue = topMetricKey ? formatMetricValue(topMetricKey, stage.metrics[topMetricKey]) : null;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-3 group"
      style={{ width: 120 }}
    >
      {/* Grade arc ring */}
      <div className="relative" style={{ width: 100, height: 100 }}>
        {/* Completeness ring (SVG) */}
        <svg
          width={100}
          height={100}
          className="absolute inset-0"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle cx={50} cy={50} r={46} fill="none" stroke="#27272a" strokeWidth={3} />
          <circle
            cx={50}
            cy={50}
            r={46}
            fill="none"
            stroke={borderColor}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 46}`}
            strokeDashoffset={`${2 * Math.PI * 46 * (1 - stage.completeness_score / 100)}`}
            opacity={0.5}
            className="transition-all duration-700"
          />
        </svg>

        {/* Inner card */}
        <div
          className="absolute inset-2 rounded-full flex flex-col items-center justify-center transition-all duration-200 group-hover:scale-105"
          style={{
            background: "linear-gradient(135deg, #18181b 60%, #27272a)",
            border: `1.5px solid ${borderColor}`,
            boxShadow: isSelected
              ? `0 0 0 3px rgba(99,102,241,0.25), 0 0 16px rgba(99,102,241,0.15)`
              : isBottleneck
              ? `0 0 12px rgba(245,158,11,0.2)`
              : "none",
          }}
        >
          <Icon size={18} style={{ color: borderColor }} className="mb-1" />
          <span
            className="text-lg font-mono font-bold tabular-nums"
            style={{ color: gradeTextColor(stage.grade) }}
          >
            {stage.grade}
          </span>
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <div className="text-xs font-semibold text-zinc-200">{label}</div>
        <div className="text-xs text-zinc-500">{sub}</div>
        {topMetricValue && (
          <div className="text-xs font-mono tabular-nums text-zinc-400 mt-0.5">{topMetricValue}</div>
        )}
        {isBottleneck && (
          <div className="text-xs text-amber-400 mt-0.5">⚠ Bottleneck</div>
        )}
      </div>
    </button>
  );
}

// ─── SLIDE-OVER PANEL ─────────────────────────────────────────────────────────

interface SlideOverProps {
  config: (typeof STAGE_CONFIG)[number];
  stage: StageData;
  onClose: () => void;
}

function SlideOver({ config, stage, onClose }: SlideOverProps) {
  const { Icon, label } = config as typeof STAGE_CONFIG[number] & { description?: string };

  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-zinc-900 border-l border-zinc-700/50 flex flex-col shadow-2xl z-20">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800">
        <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center">
          <Icon size={16} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{label}</div>
          <div
            className="text-xs font-mono font-bold"
            style={{ color: gradeTextColor(stage.grade) }}
          >
            {stage.grade} · {stage.grade_numeric}/100
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Metrics */}
        <div>
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
            Metrics
          </div>
          <div className="space-y-2">
            {Object.entries(stage.metrics)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-1 border-b border-zinc-800">
                  <span className="text-xs text-zinc-500">{metricLabel(k)}</span>
                  <span className="text-xs font-mono tabular-nums text-zinc-200">
                    {formatMetricValue(k, v)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Revenue opportunity */}
        <div className="bg-zinc-800/50 rounded-lg p-3 flex justify-between items-center">
          <span className="text-xs text-zinc-400">Revenue opportunity</span>
          <span className="text-sm font-semibold text-emerald-400 tabular-nums">
            +
            {stage.revenue_opportunity >= 1000
              ? `$${(stage.revenue_opportunity / 1000).toFixed(0)}K`
              : `$${stage.revenue_opportunity}`}
            /yr
          </span>
        </div>

        {/* Completeness */}
        <div>
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
            Data Completeness
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${stage.completeness_score}%`,
                  backgroundColor: gradeBorderHex(stage.grade),
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-zinc-400">{stage.completeness_score}%</span>
          </div>
        </div>

        {/* Strengths */}
        <div>
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
            Strengths
          </div>
          <ul className="space-y-1.5">
            {stage.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div>
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
            Weaknesses
          </div>
          <ul className="space-y-1.5">
            {stage.weaknesses.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

interface FunnelFlowProps {
  data: FunnelData;
}

export default function FunnelFlow({ data }: FunnelFlowProps) {
  const [selectedStage, setSelectedStage] = useState<StageKey | null>(null);
  const [hoveredConnector, setHoveredConnector] = useState<number | null>(null);

  const { stages, cross_stage } = data;

  // Compute drop-off percentages between stages.
  // We approximate using grade_numeric as a proxy for "traffic" through each stage.
  const stageNumerics = STAGE_CONFIG.map((s) => stages[s.key].grade_numeric);
  const dropOffs = stageNumerics.slice(0, -1).map((val, i) => {
    const next = stageNumerics[i + 1];
    return Math.max(0, val - next);
  });

  const selectedConfig = selectedStage ? STAGE_CONFIG.find((s) => s.key === selectedStage) : null;
  const selectedData = selectedStage ? stages[selectedStage] : null;

  const connectorTooltips = [
    `Traffic → Lead Gen · ${(100 - dropOffs[0]).toFixed(0)}% flow-through`,
    `Lead Gen → Email/SMS · ${(100 - dropOffs[1]).toFixed(0)}% flow-through`,
    `Email/SMS → Sales · ${(100 - dropOffs[2]).toFixed(0)}% flow-through`,
    `Sales → Ascension · ${(100 - dropOffs[3]).toFixed(0)}% flow-through`,
  ];

  return (
    <div className="relative w-full">
      {/* Flow diagram */}
      <div className="flex items-center justify-center gap-0 py-8 px-4 overflow-x-auto">
        {STAGE_CONFIG.map((config, idx) => {
          const stage = stages[config.key];
          const isSelected = selectedStage === config.key;
          const isBottleneck = config.key === cross_stage.biggest_bottleneck;

          return (
            <div key={config.key} className="flex items-center">
              <StageNode
                config={config}
                stage={stage}
                isSelected={isSelected}
                isBottleneck={isBottleneck}
                onClick={() =>
                  setSelectedStage((prev) => (prev === config.key ? null : config.key))
                }
              />

              {/* Connector (after each node except last) */}
              {idx < STAGE_CONFIG.length - 1 && (
                <Connector
                  fromGrade={stage.grade}
                  toGrade={stages[STAGE_CONFIG[idx + 1].key].grade}
                  dropPct={dropOffs[idx]}
                  isHighlighted={hoveredConnector === idx}
                  onHover={(v) => setHoveredConnector(v ? idx : null)}
                  tooltipText={connectorTooltips[idx]}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 pb-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-8 h-0.5 bg-gradient-to-r from-emerald-500 to-sky-500" />
          Flow-through
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-px bg-red-400" style={{ borderTop: "1px dashed" }} />
          Drop-off
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full border border-indigo-500/50 bg-indigo-500/10" />
          Ring = data completeness
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-amber-400">⚠</span>
          Biggest bottleneck
        </span>
      </div>

      {/* Overall funnel stats bar */}
      <div className="mx-4 mb-4 bg-zinc-900 border border-zinc-700/50 rounded-lg px-5 py-3 grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-xs text-zinc-500 mb-1">Full-Funnel CVR</div>
          <div className="text-sm font-mono tabular-nums text-zinc-200">
            {(cross_stage.full_funnel_conversion_rate * 100).toFixed(3)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-zinc-500 mb-1">Rev / Visitor</div>
          <div className="text-sm font-mono tabular-nums text-zinc-200">
            ${cross_stage.revenue_per_visitor.toFixed(2)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-zinc-500 mb-1">CAC</div>
          <div className="text-sm font-mono tabular-nums text-zinc-200">
            ${cross_stage.customer_acquisition_cost}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-zinc-500 mb-1">Total Opportunity</div>
          <div className="text-sm font-mono tabular-nums text-emerald-400">
            +$
            {cross_stage.total_revenue_opportunity >= 1000000
              ? `${(cross_stage.total_revenue_opportunity / 1000000).toFixed(1)}M`
              : `${(cross_stage.total_revenue_opportunity / 1000).toFixed(0)}K`}
            /yr
          </div>
        </div>
      </div>

      {/* Click prompt */}
      {!selectedStage && (
        <div className="text-center text-xs text-zinc-600 pb-2">
          Click any stage node to expand details
        </div>
      )}

      {/* Slide-over panel (absolutely positioned inside relative container) */}
      {selectedConfig && selectedData && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="pointer-events-auto absolute inset-y-0 right-0 w-80">
            <SlideOver
              config={selectedConfig}
              stage={selectedData}
              onClose={() => setSelectedStage(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
