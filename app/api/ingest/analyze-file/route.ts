export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { extractFileContent } from "@/lib/google-drive";
import type { DriveFile, FileFinding } from "@/lib/types";

const client = new Anthropic();

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
- Include the file even if it lacks hard metrics — use qualitative_context for non-numeric insight
- Only include metrics you actually found — never fabricate numbers
- If the file has zero business context (blank file, decorative graphic), return { "skipped": true, "reason": "<why>" } instead
- Omit business_hints fields (name, industry, etc.) if not found in the file
- Return ONLY valid JSON with no markdown fences`;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { file } = body as { file: DriveFile };

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Step 1: Extract file content (reuse existing Google Drive helper)
  const content = await extractFileContent(file);

  if (content.type === "skipped") {
    return NextResponse.json({ skipped: true, reason: content.reason });
  }

  // Step 2: Build content block — use Files API for PDFs and images
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "document"; source: { type: "file"; file_id: string } }
    | { type: "image"; source: { type: "file"; file_id: string } };

  let fileBlock: ContentBlock;

  if (content.type === "text") {
    // Plain text — pass inline, no upload needed
    fileBlock = { type: "text", text: content.content };
  } else if (content.type === "pdf") {
    const buffer = Buffer.from(content.base64, "base64");
    const uploaded = await client.beta.files.upload({
      file: await toFile(buffer, file.name, { type: "application/pdf" }),
    });
    fileBlock = {
      type: "document",
      source: { type: "file", file_id: uploaded.id },
    };
  } else {
    // image
    const buffer = Buffer.from(content.base64, "base64");
    const uploaded = await client.beta.files.upload({
      file: await toFile(buffer, file.name, { type: content.mediaType }),
    });
    fileBlock = {
      type: "image",
      source: { type: "file", file_id: uploaded.id },
    };
  }

  // Step 3: Call Claude with Files API beta
  let finding: FileFinding;
  try {
    const message = await client.beta.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      betas: ["files-api-2025-04-14"],
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `FILE: ${file.name}\nID: ${file.id}\nLINK: ${file.webViewLink}\nTYPE: ${file.mimeType}\n\nAnalyze this file and return the JSON object of findings.`,
            },
            fileBlock,
          ] as Anthropic.Beta.BetaContentBlockParam[],
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

    // Claude may return { skipped, reason } if the file has no business content
    if (parsed.skipped) {
      return NextResponse.json({ skipped: true, reason: parsed.reason ?? "No business content" });
    }

    finding = parsed as FileFinding;
  } catch (err) {
    console.error(`analyze-file error for "${file.name}":`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ finding });
}
