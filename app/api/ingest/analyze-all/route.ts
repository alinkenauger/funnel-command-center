export const dynamic = "force-dynamic";
export const maxDuration = 300;

import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractFileContent } from "@/lib/google-drive";
import type { DriveFile, FileFinding } from "@/lib/types";

const client = new Anthropic();
const CONCURRENCY = 1; // sequential — accuracy over speed
const CHUNK_DELAY_MS = 1_000; // small buffer between files

const SYSTEM_PROMPT = `You are a business intelligence analyst extracting ALL useful data from a single business owner's file.

You will receive one file — a document, spreadsheet, PDF, screenshot, or image. Analyze it thoroughly and extract ALL business-relevant information, including qualitative context (not just hard numbers).

Return a single JSON object (not an array):
{
  "file_id": "<id>",
  "file_name": "<name>",
  "file_link": "<link>",
  "stages": ["traffic"|"lead_gen"|"email_sms"|"sales_conversion"|"ascension"],
  "business_hints": {
    "name": "<business name if found>",
    "industry": "<industry if found>",
    "model": "<business model if found>",
    "products": ["<product/offer names found>"],
    "audience": "<target audience description if found>"
  },
  "metrics": {
    // Include ONLY metrics with real numbers actually found — never fabricate:
    // traffic: monthly_sessions, bounce_rate, paid_ratio, top_source, impressions, views, ctr, cpc
    // lead_gen: opt_in_rate, cost_per_lead, monthly_new_leads, list_size, landing_page_cvr
    // email_sms: open_rate, click_rate, revenue_per_subscriber, list_size, unsubscribe_rate
    // sales_conversion: conversion_rate, aov, monthly_revenue, total_revenue, refund_rate, units_sold
    // ascension: repeat_purchase_rate, ltv_estimated, upsell_take_rate, churn_rate, retention_rate
  },
  "qualitative_context": "<what this file reveals about the business: offers, messaging, strategy, audience>",
  "strengths": ["<specific positive finding — include numbers if available>"],
  "weaknesses": ["<specific problem or gap observed>"],
  "key_insights": ["<actionable insight this file provides>"],
  "missing_data": ["<important metric absent from this file>"]
}

Rules:
- Include the file even if it lacks hard metrics — use qualitative_context for non-numeric insight
- Only include metrics you actually found — never fabricate numbers
- If the file has zero business context, return { "skipped": true, "reason": "<why>" } instead
- Omit business_hints fields if not found in the file
- Return ONLY valid JSON with no markdown fences`;

const enc = new TextEncoder();

function sseEvent(data: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { files } = body as { files: DriveFile[] };

  if (!files?.length) {
    return new Response(JSON.stringify({ error: "files array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Keepalive every 15s so Vercel / nginx don't close an idle-looking stream
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      const findings: FileFinding[] = [];

      try {
        // Process files in rolling chunks of CONCURRENCY
        for (let i = 0; i < files.length; i += CONCURRENCY) {
          // Pause between chunks to avoid Haiku 50K input tokens/min rate limit
          if (i > 0) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
          const chunk = files.slice(i, i + CONCURRENCY);

          await Promise.allSettled(
            chunk.map(async (file) => {
              // Signal "analyzing" so the UI updates immediately
              controller.enqueue(sseEvent({ fileId: file.id, status: "analyzing" }));

              try {
                const content = await extractFileContent(file);

                if (content.type === "skipped") {
                  controller.enqueue(
                    sseEvent({ fileId: file.id, status: "skipped", reason: content.reason })
                  );
                  return;
                }

                // Build content block — inline base64, no Files API upload needed
                type InlineBlock =
                  | { type: "text"; text: string }
                  | {
                      type: "document";
                      source: {
                        type: "base64";
                        media_type: "application/pdf";
                        data: string;
                      };
                    }
                  | {
                      type: "image";
                      source: {
                        type: "base64";
                        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
                        data: string;
                      };
                    };

                let contentBlock: InlineBlock;
                if (content.type === "text") {
                  contentBlock = { type: "text", text: content.content };
                } else if (content.type === "pdf") {
                  contentBlock = {
                    type: "document",
                    source: {
                      type: "base64",
                      media_type: "application/pdf",
                      data: content.base64,
                    },
                  };
                } else {
                  // image
                  const mt = content.mediaType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/gif"
                    | "image/webp";
                  contentBlock = {
                    type: "image",
                    source: { type: "base64", media_type: mt, data: content.base64 },
                  };
                }

                const message = await client.messages.create({
                  model: "claude-sonnet-4-6",
                  max_tokens: 4096,
                  system: SYSTEM_PROMPT,
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: `FILE: ${file.name}\nID: ${file.id}\nLINK: ${file.webViewLink ?? ""}\nTYPE: ${file.mimeType}\n\nAnalyze this file and return the JSON object.`,
                        },
                        contentBlock,
                      ] as Anthropic.ContentBlockParam[],
                    },
                  ],
                });

                const rawText =
                  message.content[0].type === "text" ? message.content[0].text : "{}";
                const cleaned = rawText
                  .replace(/^```(?:json)?\n?/m, "")
                  .replace(/\n?```$/m, "")
                  .trim();

                const parsed = JSON.parse(cleaned);

                if (parsed.skipped) {
                  controller.enqueue(
                    sseEvent({
                      fileId: file.id,
                      status: "skipped",
                      reason: parsed.reason ?? "No business content",
                    })
                  );
                  return;
                }

                findings.push(parsed as FileFinding);
                controller.enqueue(sseEvent({ fileId: file.id, status: "done" }));
              } catch (err) {
                controller.enqueue(
                  sseEvent({
                    fileId: file.id,
                    status: "error",
                    error: err instanceof Error ? err.message : "Analysis failed",
                  })
                );
              }
            })
          );
        }

        clearInterval(keepalive);
        controller.enqueue(sseEvent({ done: true, findings }));
      } catch (err) {
        clearInterval(keepalive);
        controller.enqueue(
          sseEvent({ error: err instanceof Error ? err.message : "Analysis failed" })
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
