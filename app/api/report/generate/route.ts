export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readJsonBlob, writeJsonBlob, writeTextBlob } from "@/lib/blob-storage";
import type { FunnelData, McKinseyReportData } from "@/lib/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior McKinsey & Company partner conducting a structured business assessment.
You have been given raw funnel analytics data for a business. Your job is to produce a rigorous, MECE-structured strategic assessment.

Return ONLY valid JSON matching this exact schema:
{
  "generated_at": "<ISO timestamp>",
  "executive_summary": {
    "situation": "<1-2 sentences: factual current state>",
    "complication": "<1-2 sentences: the core problem or tension>",
    "resolution": "<1-2 sentences: the recommended path forward>"
  },
  "issue_tree": {
    "label": "Revenue Growth Challenge",
    "type": "root",
    "children": [
      {
        "label": "<Branch 1 — e.g. Acquisition Efficiency>",
        "type": "branch",
        "finding": "<1 sentence finding>",
        "children": [
          { "label": "<Leaf issue>", "type": "leaf", "finding": "<specific data-backed finding>" },
          { "label": "<Leaf issue>", "type": "leaf", "finding": "<specific data-backed finding>" }
        ]
      },
      {
        "label": "<Branch 2>",
        "type": "branch",
        "finding": "<1 sentence finding>",
        "children": [
          { "label": "<Leaf issue>", "type": "leaf", "finding": "<specific data-backed finding>" }
        ]
      },
      {
        "label": "<Branch 3>",
        "type": "branch",
        "finding": "<1 sentence finding>",
        "children": [
          { "label": "<Leaf issue>", "type": "leaf", "finding": "<specific data-backed finding>" }
        ]
      }
    ]
  },
  "financial_model": {
    "stages": [
      {
        "name": "Traffic",
        "current_arr": <number>,
        "optimized_arr": <number>,
        "delta": <number>,
        "key_lever": "<what to change>"
      },
      { "name": "Lead Generation", "current_arr": <number>, "optimized_arr": <number>, "delta": <number>, "key_lever": "<...>" },
      { "name": "Email & SMS", "current_arr": <number>, "optimized_arr": <number>, "delta": <number>, "key_lever": "<...>" },
      { "name": "Sales Conversion", "current_arr": <number>, "optimized_arr": <number>, "delta": <number>, "key_lever": "<...>" },
      { "name": "Ascension", "current_arr": <number>, "optimized_arr": <number>, "delta": <number>, "key_lever": "<...>" }
    ],
    "total_current_arr": <sum of current_arr>,
    "total_optimized_arr": <sum of optimized_arr>,
    "total_delta": <sum of delta>
  },
  "action_plan": [
    {
      "sprint": "Days 1–30",
      "initiatives": [
        { "priority": 1, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Low" },
        { "priority": 2, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Medium" },
        { "priority": 3, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Medium" }
      ]
    },
    {
      "sprint": "Days 31–60",
      "initiatives": [
        { "priority": 1, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Medium" },
        { "priority": 2, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "High" },
        { "priority": 3, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Medium" }
      ]
    },
    {
      "sprint": "Days 61–90",
      "initiatives": [
        { "priority": 1, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "High" },
        { "priority": 2, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Medium" },
        { "priority": 3, "action": "<specific action>", "owner": "<Role>", "success_metric": "<measurable KPI>", "effort": "Low" }
      ]
    }
  ],
  "strategic_assessment": {
    "overall_grade": "<letter grade>",
    "top_risks": ["<Risk 1>", "<Risk 2>", "<Risk 3>"],
    "top_opportunities": ["<Opp 1>", "<Opp 2>", "<Opp 3>"],
    "confidence": "high" | "medium" | "low"
  }
}

Be specific, quantitative, and data-driven. Reference actual numbers from the input. No platitudes.`;

function buildUserPrompt(data: FunnelData): string {
  return `Analyze this funnel data and generate the McKinsey assessment JSON:

BUSINESS: ${data.business.name}
INDUSTRY: ${data.business.industry}
MODEL: ${data.business.business_model}
DATA COMPLETENESS: ${data.business.data_completeness_percent}%

STAGE GRADES:
- Traffic: ${data.stages.traffic.grade} (${data.stages.traffic.grade_numeric}/100)
  Metrics: ${JSON.stringify(data.stages.traffic.metrics)}
  Strengths: ${data.stages.traffic.strengths.join("; ")}
  Weaknesses: ${data.stages.traffic.weaknesses.join("; ")}
  Revenue Opportunity: $${data.stages.traffic.revenue_opportunity}

- Lead Gen: ${data.stages.lead_gen.grade} (${data.stages.lead_gen.grade_numeric}/100)
  Metrics: ${JSON.stringify(data.stages.lead_gen.metrics)}
  Strengths: ${data.stages.lead_gen.strengths.join("; ")}
  Weaknesses: ${data.stages.lead_gen.weaknesses.join("; ")}
  Revenue Opportunity: $${data.stages.lead_gen.revenue_opportunity}

- Email/SMS: ${data.stages.email_sms.grade} (${data.stages.email_sms.grade_numeric}/100)
  Metrics: ${JSON.stringify(data.stages.email_sms.metrics)}
  Strengths: ${data.stages.email_sms.strengths.join("; ")}
  Weaknesses: ${data.stages.email_sms.weaknesses.join("; ")}
  Revenue Opportunity: $${data.stages.email_sms.revenue_opportunity}

- Sales Conversion: ${data.stages.sales_conversion.grade} (${data.stages.sales_conversion.grade_numeric}/100)
  Metrics: ${JSON.stringify(data.stages.sales_conversion.metrics)}
  Strengths: ${data.stages.sales_conversion.strengths.join("; ")}
  Weaknesses: ${data.stages.sales_conversion.weaknesses.join("; ")}
  Revenue Opportunity: $${data.stages.sales_conversion.revenue_opportunity}

- Ascension: ${data.stages.ascension.grade} (${data.stages.ascension.grade_numeric}/100)
  Metrics: ${JSON.stringify(data.stages.ascension.metrics)}
  Strengths: ${data.stages.ascension.strengths.join("; ")}
  Weaknesses: ${data.stages.ascension.weaknesses.join("; ")}
  Revenue Opportunity: $${data.stages.ascension.revenue_opportunity}

CROSS-STAGE:
- Full funnel CVR: ${data.cross_stage.full_funnel_conversion_rate}
- Revenue per visitor: $${data.cross_stage.revenue_per_visitor}
- CAC: $${data.cross_stage.customer_acquisition_cost}
- Biggest bottleneck: ${data.cross_stage.biggest_bottleneck}
- Overall grade: ${data.cross_stage.overall_grade} (${data.cross_stage.overall_grade_numeric}/100)
- Total revenue opportunity: $${data.cross_stage.total_revenue_opportunity}

Return ONLY the JSON object with no markdown fences, no explanation, no preamble.`;
}

function reportToMarkdown(report: McKinseyReportData, businessName: string): string {
  const { executive_summary, issue_tree, financial_model, action_plan, strategic_assessment } =
    report;

  function treeToMd(node: McKinseyReportData["issue_tree"], depth = 0): string {
    const indent = "  ".repeat(depth);
    let md = `${indent}- **${node.label}**`;
    if (node.finding) md += `: ${node.finding}`;
    md += "\n";
    if (node.children) {
      for (const child of node.children) {
        md += treeToMd(child, depth + 1);
      }
    }
    return md;
  }

  return `# McKinsey Strategic Assessment: ${businessName}
*Generated: ${new Date(report.generated_at).toLocaleDateString()}*

---

## Executive Summary

**Situation:** ${executive_summary.situation}

**Complication:** ${executive_summary.complication}

**Resolution:** ${executive_summary.resolution}

---

## MECE Issue Tree

${treeToMd(issue_tree)}

---

## Financial Model

| Stage | Current ARR | Optimized ARR | Delta | Key Lever |
|-------|------------|--------------|-------|-----------|
${financial_model.stages
  .map(
    (s) =>
      `| ${s.name} | $${s.current_arr.toLocaleString()} | $${s.optimized_arr.toLocaleString()} | +$${s.delta.toLocaleString()} | ${s.key_lever} |`
  )
  .join("\n")}
| **TOTAL** | **$${financial_model.total_current_arr.toLocaleString()}** | **$${financial_model.total_optimized_arr.toLocaleString()}** | **+$${financial_model.total_delta.toLocaleString()}** | |

---

## 90-Day Action Plan

${action_plan
  .map(
    (sprint) => `### ${sprint.sprint}

| # | Action | Owner | Success Metric | Effort |
|---|--------|-------|---------------|--------|
${sprint.initiatives
  .map((i) => `| ${i.priority} | ${i.action} | ${i.owner} | ${i.success_metric} | ${i.effort} |`)
  .join("\n")}`
  )
  .join("\n\n")}

---

## Strategic Assessment

**Overall Grade:** ${strategic_assessment.overall_grade}
**Confidence:** ${strategic_assessment.confidence}

**Top Risks:**
${strategic_assessment.top_risks.map((r) => `- ${r}`).join("\n")}

**Top Opportunities:**
${strategic_assessment.top_opportunities.map((o) => `- ${o}`).join("\n")}
`;
}

export async function POST() {
  try {
    const data = await readJsonBlob<FunnelData>("data/master-data.json");
    if (!data) {
      return NextResponse.json({ error: "master-data.json not found" }, { status: 404 });
    }

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(data) }],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let report: McKinseyReportData;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      report = JSON.parse(cleaned);
      report.generated_at = new Date().toISOString();
    } catch {
      console.error("Failed to parse Claude response:", rawText.slice(0, 500));
      return NextResponse.json({ error: "Failed to parse report JSON from Claude" }, { status: 500 });
    }

    await Promise.all([
      writeJsonBlob("reports/mckinsey-assessment.json", report),
      writeTextBlob("reports/mckinsey-assessment.md", reportToMarkdown(report, data.business.name)),
    ]);

    return NextResponse.json({ success: true, report });
  } catch (err) {
    console.error("Report generation error:", err);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
