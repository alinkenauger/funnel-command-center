export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel: allow up to 300s for file downloads + Claude response

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractFileContent } from "@/lib/google-drive";
import type { DriveFile, FileFinding } from "@/lib/types";

const client = new Anthropic();

const BATCH_SYSTEM_PROMPT = `You are a business intelligence analyst extracting ALL useful data from a business owner's Google Drive files.

You will receive one or more files — documents, spreadsheets, PDFs, screenshots, or images. For EVERY file you can read, analyze it and extract ALL business-relevant information, including qualitative context (not just hard numbers).

Return a JSON array with one object per file that has ANY useful business or marketing content:
[
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
      // Include ONLY metrics with real numbers actually found in the file — never fabricate:
      // traffic: monthly_sessions, bounce_rate, paid_ratio, top_source, impressions, views, reach, ctr, cpc, cpm
      // lead_gen: opt_in_rate, cost_per_lead, monthly_new_leads, list_size, landing_page_cvr
      // email_sms: open_rate, click_rate, revenue_per_subscriber, list_size, unsubscribe_rate, deliverability_rate
      // sales_conversion: conversion_rate, aov, monthly_revenue, total_revenue, cart_abandonment, refund_rate, units_sold, close_rate
      // ascension: repeat_purchase_rate, ltv_estimated, upsell_take_rate, churn_rate, nps, retention_rate
    },
    "qualitative_context": "<Describe what this file reveals about the business: its offers, messaging, positioning, target audience, marketing strategy, funnel structure, or competitive advantages — even if no hard numbers are present>",
    "strengths": ["<specific positive finding — include numbers if available>"],
    "weaknesses": ["<specific problem, gap, or underperformance observed>"],
    "key_insights": ["<actionable insight this file provides about the business>"],
    "missing_data": ["<important metric that should be in this file but is absent>"]
  }
]

For IMAGES and SCREENSHOTS — look carefully for:
- Any visible numbers, percentages, charts, graphs, or tables — extract ALL values you can read
- The platform shown (Google Analytics, Facebook Ads, Stripe, YouTube Studio, email platform, Shopify, etc.)
- Date ranges or time periods shown in the data
- Product names, pricing, offer details, or call-to-action text visible in the image
- Landing page, ad creative, or sales page screenshots: describe the offer and visible conversion elements
- Dashboard screenshots: extract every metric value visible on screen

For DOCUMENTS and PDFs:
- Extract all numeric KPIs and performance data
- Capture business model, products/services, pricing structures, and offer details
- Note audience descriptions, pain points, and messaging frameworks
- Extract email sequences, scripts, or copy that reveals marketing strategy

Rules:
- Include EVERY file with ANY business or marketing context — do NOT omit files just because they lack hard metrics; use qualitative_context instead
- Only include metrics you actually found — never fabricate numbers
- Omit only files that are truly unreadable or contain zero business context (e.g., a blank file or pure decorative graphic with no text or data)
- Omit business_hints fields (name, industry, etc.) if not found in the file
- Do NOT duplicate the same data point across multiple files — each file gets its own distinct entry
- Return ONLY valid JSON with no markdown fences`;

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
      max_tokens: 16384,
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
