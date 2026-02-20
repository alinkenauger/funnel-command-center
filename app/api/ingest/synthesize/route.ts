export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel: allow up to 300s for Claude synthesis

import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readJsonBlob, writeJsonBlob } from "@/lib/blob-storage";
import type { DriveFile, FileFinding, FunnelData, DriveConfig, GapQuestion, DriveSource } from "@/lib/types";
import { buildPlatformMetricsSummary } from "@/lib/platform-connectors";
import type { StoredPlatformMetrics } from "@/lib/platform-connectors/types";

const client = new Anthropic();

const SYNTHESIS_SYSTEM_PROMPT = `You are a senior business analyst synthesizing findings from multiple business documents into a structured funnel performance report.

You will receive a JSON array of per-file findings. Each finding covers one or more funnel stages: traffic, lead_gen, email_sms, sales_conversion, ascension.

Your job is to merge all findings into a single cohesive analysis. Return ONLY a valid JSON object (no markdown) with this exact shape:

{
  "business": {
    "name": "<best guess from docs, or 'Unknown'>",
    "industry": "<best guess>",
    "business_model": "<e.g. ecommerce, SaaS, coaching, info product>",
    "data_completeness_percent": <0-100 integer>
  },
  "stages": {
    "traffic": {
      "grade": "<A/B/C/D/F>",
      "grade_numeric": <4.0/3.0/2.0/1.0/0.0>,
      "grade_confidence": "<high|medium|low>",
      "completeness_score": <0-100>,
      "metrics": {
        // Include only metrics actually found across all docs:
        // monthly_sessions, bounce_rate, paid_ratio, top_source
      },
      "strengths": ["<specific finding with numbers>"],
      "weaknesses": ["<specific problem>"],
      "revenue_opportunity": <estimated monthly $ upside if this stage is optimized, integer>
    },
    "lead_gen": { /* same shape */ },
    "email_sms": { /* same shape */ },
    "sales_conversion": { /* same shape */ },
    "ascension": { /* same shape */ }
  },
  "cross_stage": {
    "full_funnel_conversion_rate": <decimal, e.g. 0.021>,
    "revenue_per_visitor": <decimal>,
    "customer_acquisition_cost": <number or 0 if unknown>,
    "biggest_bottleneck": "<stage name and why>",
    "overall_grade": "<A/B/C/D/F>",
    "overall_grade_numeric": <4.0 to 0.0>,
    "overall_grade_confidence": "<high|medium|low>",
    "total_revenue_opportunity": <sum of all stage revenue_opportunity>
  },
  "sources": [
    {
      "file_id": "<id>",
      "file_name": "<name>",
      "file_link": "<link>",
      "stages_referenced": ["traffic", ...]
    }
  ],
  "gap_questions": [
    {
      "stage": "<stage name>",
      "question": "<specific question to ask the client>",
      "context": "<why this data matters and what decision it would unlock>"
    }
  ]
}

Rules:
- Synthesize conflicting numbers by using the most recent or most complete source.
- Only include metrics you actually found in the findings — never fabricate numbers.
- Grade each stage based on the metrics vs industry benchmarks:
  * traffic: A=bounce<40%, B=bounce<55%, C=bounce<70%, D/F=worse or no data
  * lead_gen: A=opt_in>15%, B=opt_in>8%, C=opt_in>3%, D/F=worse
  * email_sms: A=open>40%, B=open>25%, C=open>15%, D/F=worse
  * sales_conversion: A=cvr>5%, B=cvr>2%, C=cvr>1%, D/F=worse
  * ascension: A=repeat>40%, B=repeat>25%, C=repeat>10%, D/F=worse
- Set grade_confidence to "high" if ≥3 data points exist for the stage, "medium" for 1-2, "low" for 0.
- Generate gap_questions only for stages with grade_confidence="low" or critical missing metrics.
- Limit gap_questions to the 5 most impactful missing data points.
- Return ONLY valid JSON with no markdown fences, no explanation, no commentary.`;

const enc = new TextEncoder();

function sseEvent(data: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { allFindings, folderId, allFiles } = body as {
    allFindings: FileFinding[];
    folderId: string;
    allFiles: DriveFile[];
  };

  if (!allFindings || !folderId) {
    return new Response(
      JSON.stringify({ error: "allFindings and folderId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial status so the client knows the connection is alive
      controller.enqueue(sseEvent({ status: "synthesizing" }));

      // Keepalive: SSE comment lines every 15s prevent Vercel / nginx from
      // closing an idle-looking connection while Claude is generating.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch {
          // controller already closed — stop the interval
          clearInterval(keepalive);
        }
      }, 15_000);

      try {
        // ── Build compact findings payload ──────────────────────────
        // Cap at ~120 KB to avoid context limits
        const MAX_FINDINGS_CHARS = 120_000;
        let findingsSummary = JSON.stringify(allFindings, null, 0);
        if (findingsSummary.length > MAX_FINDINGS_CHARS) {
          const trimmed = [...allFindings];
          while (
            JSON.stringify(trimmed, null, 0).length > MAX_FINDINGS_CHARS &&
            trimmed.length > 1
          ) {
            trimmed.pop();
          }
          findingsSummary = JSON.stringify(trimmed, null, 0);
        }

        // ── Inject platform metrics if cached ───────────────────────
        const platformMetrics = await readJsonBlob<StoredPlatformMetrics>(
          "data/platform-metrics.json"
        );
        const platformSection = platformMetrics
          ? buildPlatformMetricsSummary(platformMetrics)
          : "";

        // ── Call Claude (Haiku: 5-10× faster than Sonnet for JSON) ──
        const message = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: SYNTHESIS_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content:
                (platformSection ? `${platformSection}\n\n---\n\n` : "") +
                `Here are the per-file findings from analyzing the business's Google Drive folder (${allFindings.length} files with relevant content):\n\n${findingsSummary}\n\nSynthesize these into the complete funnel analysis JSON object.`,
            },
          ],
        });

        const rawText =
          message.content[0].type === "text" ? message.content[0].text : "{}";
        const cleaned = rawText
          .replace(/^```(?:json)?\n?/m, "")
          .replace(/\n?```$/m, "")
          .trim();
        const synthesized = JSON.parse(cleaned);

        const gapQuestions: GapQuestion[] = synthesized.gap_questions ?? [];
        const sources: DriveSource[] = synthesized.sources ?? [];

        const funnelData: FunnelData = {
          ...synthesized,
          drive_folder_id: folderId,
          ingested_at: new Date().toISOString(),
          sources,
          gap_questions: gapQuestions,
          processing_log: [
            {
              timestamp: new Date().toISOString(),
              action: `Ingested ${allFiles.length} Drive files, extracted ${allFindings.length} findings`,
            },
          ],
        } as FunnelData;

        // ── Persist results concurrently ────────────────────────────
        const existing = await readJsonBlob<DriveConfig>("data/drive-config.json");
        const updatedConfig: DriveConfig = {
          folderId,
          folderName: existing?.folderName,
          connectedAt: existing?.connectedAt ?? new Date().toISOString(),
          lastSyncedAt: new Date().toISOString(),
          knownFileIds: allFiles.map((f) => f.id),
        };
        await Promise.all([
          writeJsonBlob("data/master-data.json", funnelData),
          writeJsonBlob("data/drive-config.json", updatedConfig),
        ]);

        clearInterval(keepalive);
        controller.enqueue(
          sseEvent({
            ok: true,
            gapQuestions: funnelData.gap_questions ?? [],
            sourceCount: funnelData.sources?.length ?? 0,
          })
        );
      } catch (err) {
        clearInterval(keepalive);
        console.error("Synthesis error:", err);
        controller.enqueue(
          sseEvent({
            error: err instanceof Error ? err.message : "Synthesis failed",
          })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
