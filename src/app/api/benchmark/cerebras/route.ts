import { NextRequest, NextResponse } from "next/server";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { providers } from "@/lib/providers";
import { DEFAULTS } from "@/lib/config";
import {
  createStreamMetrics,
  updateMetrics,
  buildSuccessResult,
  buildErrorResult,
  getRequiredApiKey,
} from "@/lib/benchmark-utils";

export async function POST(request: NextRequest) {
  const metrics = createStreamMetrics();
  const provider = providers.cerebras;

  try {
    const { prompt, max_tokens } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = getRequiredApiKey("CEREBRAS_API_KEY");
    const client = new Cerebras({ apiKey });

    const stream = await client.chat.completions.create({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: max_tokens || DEFAULTS.MAX_TOKENS,
      stream: true,
    });

    for await (const chunk of stream) {
      // Cerebras SDK types don't properly type the streaming response
      const choices = chunk.choices as Array<{ delta?: { content?: string } }>;
      const content = choices?.[0]?.delta?.content;

      if (content) {
        updateMetrics(metrics, content);
      }
    }

    const result = buildSuccessResult("cerebras", provider.model, metrics);
    return NextResponse.json(result);
  } catch (error) {
    const result = buildErrorResult("cerebras", provider.model, error, metrics.startTime);
    return NextResponse.json(result);
  }
}
