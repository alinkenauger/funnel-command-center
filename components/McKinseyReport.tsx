"use client";

import { useState, useRef } from "react";
import {
  X,
  ChevronRight,
  ChevronDown,
  Download,
  Printer,
  Share2,
  AlertTriangle,
  TrendingUp,
  Check,
} from "lucide-react";
import type { McKinseyReportData, IssueNode } from "@/lib/types";

interface McKinseyReportProps {
  report: McKinseyReportData;
  businessName: string;
  onClose: () => void;
}

// ─── Issue Tree ────────────────────────────────────────────────────────────────

function IssueTreeNode({ node, depth = 0 }: { node: IssueNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  const depthColors: Record<number, string> = {
    0: "text-zinc-100 text-sm font-semibold",
    1: "text-zinc-200 text-sm font-medium",
    2: "text-zinc-300 text-sm",
    3: "text-zinc-400 text-xs",
  };
  const textClass = depthColors[Math.min(depth, 3)];

  const depthBorders: Record<number, string> = {
    0: "border-indigo-500/60",
    1: "border-indigo-400/40",
    2: "border-zinc-600/60",
    3: "border-zinc-700/60",
  };
  const borderClass = depthBorders[Math.min(depth, 3)];

  return (
    <div className={depth > 0 ? "ml-5 border-l pl-4 py-0.5 " + borderClass : ""}>
      <div
        className={`flex items-start gap-1.5 py-1.5 group ${hasChildren ? "cursor-pointer" : ""}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* expand/collapse icon */}
        <span className="flex-shrink-0 mt-0.5 w-3.5">
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={13} className="text-zinc-500" />
            ) : (
              <ChevronRight size={13} className="text-zinc-500" />
            )
          ) : (
            <span className="block w-1.5 h-1.5 rounded-full bg-zinc-600 mt-1.5 mx-auto" />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <span className={textClass}>{node.label}</span>
          {node.finding && (
            <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{node.finding}</p>
          )}
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children!.map((child, i) => (
            <IssueTreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Effort badge ───────────────────────────────────────────────────────────────

function EffortBadge({ effort }: { effort: "Low" | "Medium" | "High" }) {
  const styles = {
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    High: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border font-medium ${styles[effort]}`}
    >
      {effort}
    </span>
  );
}

// ─── Grade badge ────────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const letter = grade.charAt(0).toUpperCase();
  const colors: Record<string, string> = {
    A: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    B: "text-emerald-300 border-emerald-500/20 bg-emerald-500/8",
    C: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    D: "text-red-400 border-red-500/30 bg-red-500/10",
    F: "text-red-500 border-red-500/40 bg-red-500/15",
  };
  const cls = colors[letter] ?? "text-zinc-400 border-zinc-600 bg-zinc-800";
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border font-mono text-lg font-bold ${cls}`}
    >
      {letter}
    </span>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, index }: { label: string; index: number }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-500">
        {index}
      </span>
      <h2 className="text-base font-semibold text-zinc-100 tracking-tight">{label}</h2>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function McKinseyReport({
  report,
  businessName,
  onClose,
}: McKinseyReportProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const { executive_summary, issue_tree, financial_model, action_plan, strategic_assessment } =
    report;

  function handlePrint() {
    window.print();
  }

  async function handleDownloadMd() {
    setDownloading(true);
    try {
      const res = await fetch("/api/reports?filename=mckinsey-assessment.md");
      if (!res.ok) throw new Error("Not found");
      const { content } = await res.json();
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${businessName.replace(/\s+/g, "-")}-mckinsey-assessment.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fall back: generate from current report data
      const text = `# McKinsey Strategic Assessment: ${businessName}\n\nGenerated: ${new Date(
        report.generated_at
      ).toLocaleDateString()}\n`;
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mckinsey-assessment.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set("report", "true");
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Delta formatting
  function fmt(n: number) {
    return n.toLocaleString();
  }
  function fmtDelta(n: number) {
    return (n >= 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString();
  }

  const gradeColor =
    strategic_assessment.overall_grade.charAt(0) === "A"
      ? "text-emerald-400"
      : strategic_assessment.overall_grade.charAt(0) === "B"
      ? "text-emerald-300"
      : strategic_assessment.overall_grade.charAt(0) === "C"
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm overflow-y-auto print:relative print:inset-auto print:bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur border-b border-zinc-800 print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X size={16} />
            </button>
            <span className="text-sm font-medium text-zinc-300">{businessName}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">
              McKinsey Strategic Assessment
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-600">
              {new Date(report.generated_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadMd}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              {downloading ? "Downloading…" : "Download .md"}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Share2 size={12} />}
              {copied ? "Copied!" : "Share Link"}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
            >
              <Printer size={12} />
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Report body */}
      <div ref={reportRef} className="max-w-4xl mx-auto px-6 py-10 print:px-0 print:py-4">
        {/* ── Cover ── */}
        <div className="mb-10 print:mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-indigo-400 uppercase tracking-widest mb-2">
                Strategic Assessment
              </p>
              <h1 className="text-2xl font-bold text-zinc-100 print:text-black leading-tight">
                {businessName}
              </h1>
              <p className="text-sm text-zinc-500 mt-1 print:text-gray-500">
                Prepared {new Date(report.generated_at).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <GradeBadge grade={strategic_assessment.overall_grade} />
              <div>
                <p className="text-xs text-zinc-500">Overall</p>
                <p className={`text-sm font-semibold ${gradeColor}`}>
                  {strategic_assessment.overall_grade}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-10 print:space-y-6">
          {/* ── 1. Executive Summary ── */}
          <section>
            <SectionHeader label="Executive Summary" index={1} />
            <div className="grid grid-cols-1 gap-3">
              {(
                [
                  {
                    key: "situation",
                    label: "Situation",
                    color: "border-l-zinc-600",
                    dot: "bg-zinc-500",
                  },
                  {
                    key: "complication",
                    label: "Complication",
                    color: "border-l-amber-500",
                    dot: "bg-amber-500",
                  },
                  {
                    key: "resolution",
                    label: "Resolution",
                    color: "border-l-indigo-500",
                    dot: "bg-indigo-500",
                  },
                ] as const
              ).map(({ key, label, color, dot }) => (
                <div
                  key={key}
                  className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 border-l-2 ${color} print:bg-gray-50 print:border-gray-200`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide print:text-gray-500">
                      {label}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed print:text-gray-900">
                    {executive_summary[key]}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 2. MECE Issue Tree ── */}
          <section>
            <SectionHeader label="MECE Issue Tree" index={2} />
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 print:bg-gray-50 print:border-gray-200">
              <IssueTreeNode node={issue_tree} depth={0} />
            </div>
          </section>

          {/* ── 3. Financial Model ── */}
          <section>
            <SectionHeader label="Financial Model — Revenue Opportunity" index={3} />
            <div className="overflow-hidden rounded-lg border border-zinc-800 print:border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800 print:bg-gray-100 print:border-gray-200">
                    {["Stage", "Current ARR", "Optimized ARR", "Delta", "Key Lever"].map((h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide print:text-gray-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 print:divide-gray-200">
                  {financial_model.stages.map((stage, i) => (
                    <tr
                      key={i}
                      className="bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors print:bg-white"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-200 print:text-gray-900">
                        {stage.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-400 tabular-nums print:text-gray-600">
                        ${fmt(stage.current_arr)}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-400 tabular-nums print:text-green-700">
                        ${fmt(stage.optimized_arr)}
                      </td>
                      <td className="px-4 py-3 font-mono text-indigo-400 tabular-nums print:text-indigo-700">
                        {fmtDelta(stage.delta)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs leading-relaxed print:text-gray-600">
                        {stage.key_lever}
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className="bg-zinc-800/80 border-t border-zinc-700 print:bg-gray-100 print:border-gray-300">
                    <td className="px-4 py-3 font-bold text-zinc-100 text-sm print:text-gray-900">
                      TOTAL
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-200 tabular-nums print:text-gray-900">
                      ${fmt(financial_model.total_current_arr)}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-300 tabular-nums print:text-green-700">
                      ${fmt(financial_model.total_optimized_arr)}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-300 tabular-nums print:text-indigo-700">
                      {fmtDelta(financial_model.total_delta)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Delta highlight card */}
            <div className="mt-3 flex items-center gap-3 bg-indigo-500/8 border border-indigo-500/20 rounded-lg px-4 py-3">
              <TrendingUp size={16} className="text-indigo-400 flex-shrink-0" />
              <p className="text-sm text-zinc-300">
                Optimizing across all 5 stages unlocks{" "}
                <span className="font-bold text-indigo-400">
                  {fmtDelta(financial_model.total_delta)}
                </span>{" "}
                in additional ARR — a{" "}
                <span className="font-bold text-indigo-400">
                  {financial_model.total_current_arr > 0
                    ? Math.round(
                        (financial_model.total_delta / financial_model.total_current_arr) * 100
                      )
                    : "N/A"}
                  %
                </span>{" "}
                improvement.
              </p>
            </div>
          </section>

          {/* ── 4. 90-Day Action Plan ── */}
          <section>
            <SectionHeader label="90-Day Action Plan" index={4} />
            <div className="space-y-4">
              {action_plan.map((sprint, si) => (
                <div
                  key={si}
                  className="border border-zinc-800 rounded-lg overflow-hidden print:border-gray-200"
                >
                  <div className="bg-zinc-900 px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2 print:bg-gray-100 print:border-gray-200">
                    <span className="text-xs font-mono text-zinc-500">{`0${si + 1}`}</span>
                    <h3 className="text-sm font-semibold text-zinc-200 print:text-gray-900">
                      {sprint.sprint}
                    </h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900/40 border-b border-zinc-800/50 print:bg-gray-50">
                        {["#", "Action", "Owner", "Success Metric", "Effort"].map((h) => (
                          <th
                            key={h}
                            className="text-left px-4 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide print:text-gray-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30 print:divide-gray-100">
                      {sprint.initiatives.map((initiative, ii) => (
                        <tr
                          key={ii}
                          className="bg-zinc-900/20 hover:bg-zinc-800/30 transition-colors print:bg-white"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                            P{initiative.priority}
                          </td>
                          <td className="px-4 py-3 text-zinc-200 leading-snug print:text-gray-900">
                            {initiative.action}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap print:text-gray-600">
                            {initiative.owner}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs leading-snug print:text-gray-600">
                            {initiative.success_metric}
                          </td>
                          <td className="px-4 py-3">
                            <EffortBadge effort={initiative.effort} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {/* ── 5. Strategic Assessment ── */}
          <section>
            <SectionHeader label="Strategic Assessment" index={5} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
              {/* Grade + Confidence */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3 print:bg-gray-50 print:border-gray-200">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                    Overall Grade
                  </p>
                  <div className="flex items-center gap-3">
                    <GradeBadge grade={strategic_assessment.overall_grade} />
                    <div>
                      <p className={`text-xl font-bold ${gradeColor}`}>
                        {strategic_assessment.overall_grade}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">
                    Confidence
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        strategic_assessment.confidence === "high"
                          ? "bg-emerald-400"
                          : strategic_assessment.confidence === "medium"
                          ? "bg-amber-400"
                          : "bg-red-400"
                      }`}
                    />
                    <span className="text-sm text-zinc-300 capitalize">
                      {strategic_assessment.confidence}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Risks */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 print:bg-gray-50 print:border-gray-200">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Top Risks
                  </p>
                </div>
                <ul className="space-y-2">
                  {strategic_assessment.top_risks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 text-xs font-mono text-red-500/70 mt-0.5">
                        R{i + 1}
                      </span>
                      <span className="text-xs text-zinc-300 leading-relaxed print:text-gray-700">
                        {risk}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Top Opportunities */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 print:bg-gray-50 print:border-gray-200">
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp size={13} className="text-emerald-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Top Opportunities
                  </p>
                </div>
                <ul className="space-y-2">
                  {strategic_assessment.top_opportunities.map((opp, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 text-xs font-mono text-emerald-500/70 mt-0.5">
                        O{i + 1}
                      </span>
                      <span className="text-xs text-zinc-300 leading-relaxed print:text-gray-700">
                        {opp}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-zinc-800 flex items-center justify-between print:border-gray-200">
          <p className="text-xs text-zinc-600">
            Generated by SOB Business Analysis · {new Date(report.generated_at).toISOString()}
          </p>
          <p className="text-xs text-zinc-600 print:hidden">
            Powered by Claude (Anthropic)
          </p>
        </div>
      </div>
    </div>
  );
}
