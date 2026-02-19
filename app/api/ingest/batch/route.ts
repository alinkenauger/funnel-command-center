export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractFileContent } from "@/lib/google-drive";
import type { DriveFile, FileFinding } from "@/lib/types";

const client = new Anthropic();

const BATCH_SYSTEM_PROMPT = `You are a business analyst extracting structured data from client documents.

You will receive one or more files from a business's Google Drive folder. For each file analyze it for marketing and sales funnel performance data.

Return ONLY a JSON array with one object per file analyzed (skip files with no relevant business content):
[
  {
    "file_id": "<id>",
    "file_name": "<name>",
    "file_link": "<link>",
    "stages": ["traffic"|"lead_gen"|"email_sms"|"sales_conversion"|"ascension"],
    "business_hints": { "name": "<if found>", "industry": "<if found>", "model": "<if found>" },
    "metrics": {
      // Include ONLY metrics actually found in the document with real numbers:
      // traffic: monthly_sessions, bounce_rate, paid_ratio, top_source
      // lead_gen: opt_in_rate, cost_per_lead, monthly_new_leads, list_size
      // email_sms: open_rate, click_rate, revenue_per_subscriber, list_size
      // sales_conversion: conversion_rate, aov, monthly_revenue, cart_abandonment, refund_rate
      // ascension: repeat_purchase_rate, ltv_estimated, upsell_take_rate
    },
    "strengths": ["<specific positive finding with numbers if available>"],
    "weaknesses": ["<specific problem or underperformance found>"],
    "key_insights": ["<actionable insight from this document>"],
    "missing_data": ["<important metric that should be here but isn't>"]
  }
]

Rules:
- Be specific and quantitative. Use actual numbers from the documents.
- Only include metrics you actually found — do not fabricate numbers.
- If a file has no business-relevant content, omit it from the array.
- If business_hints are not found in a file, omit that field.
- Return ONLY valid JSON with no markdown fences.`;

type MessageParam = Anthropic.MessageParam;
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { files, batchIndex } = body as { files: DriveFile[]; batchIndex: number };

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Download all file contents in parallel
  const contentResults = await Promise.all(
    files.map(async (file) => ({ file, content: await extractFileContent(file) }))
  );

  // Build Claude message content blocks
  const userContentBlocks: ContentBlock[] = [];
  const skippedFiles: Array<{ name: string; reason: string }> = [];

  for (const { file, content } of contentResults) {
    if (content.type === "skipped") {
      skippedFiles.push({ name: file.name, reason: content.reason });
      continue;
    }

    // Add a text header identifying the file
    userContentBlocks.push({
      type: "text",
      text: `\n---\nFILE: ${file.name}\nID: ${file.id}\nLINK: ${file.webViewLink}\nTYPE: ${file.mimeType}\n---\n`,
    });

    if (content.type === "text") {
      userContentBlocks.push({ type: "text", text: content.content });
    } else if (content.type === "pdf") {
      userContentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: content.base64 },
      });
    } else if (content.type === "image") {
      userContentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: content.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: content.base64,
        },
      });
    }
  }

  // If no content was extracted, return empty findings
  if (userContentBlocks.length === 0) {
    return NextResponse.json({ batchIndex, findings: [], skipped: skippedFiles });
  }

  const messages: MessageParam[] = [
    {
      role: "user",
      content: [
        ...userContentBlocks,
        { type: "text", text: "\nAnalyze the files above and return the JSON array of findings." },
      ] as MessageParam["content"],
    },
  ];

  let findings: FileFinding[] = [];
  try {
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: BATCH_SYSTEM_PROMPT,
      messages,
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    const cleaned = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    findings = JSON.parse(cleaned);
  } catch (err) {
    console.error(`Batch ${batchIndex} parse error:`, err);
    // Return empty findings rather than failing the whole pipeline
    return NextResponse.json({
      batchIndex,
      findings: [],
      skipped: skippedFiles,
      error: "Claude parse error — batch skipped",
    });
  }

  return NextResponse.json({ batchIndex, findings, skipped: skippedFiles });
}
