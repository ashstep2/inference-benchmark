import { NextRequest, NextResponse } from "next/server";
import { providers } from "@/lib/providers";
import { DEFAULTS } from "@/lib/config";
import {
  createStreamMetrics,
  updateMetrics,
  buildSuccessResult,
  buildErrorResult,
  getRequiredApiKey,
  createApiError,
  createStreamReader,
} from "@/lib/benchmark-utils";

export async function POST(request: NextRequest) {
  const metrics = createStreamMetrics();
  const provider = providers.fireworks;

  try {
    const { prompt, max_tokens } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = getRequiredApiKey("FIREWORKS_API_KEY");

    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: max_tokens || DEFAULTS.MAX_TOKENS,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw createApiError("Fireworks", response.status, errorText);
    }

    for await (const content of createStreamReader(response)) {
      updateMetrics(metrics, content);
    }

    const result = buildSuccessResult("fireworks", provider.model, metrics);
    return NextResponse.json(result);
  } catch (error) {
    const result = buildErrorResult("fireworks", provider.model, error, metrics.startTime);
    return NextResponse.json(result);
  }
}
