import { NextRequest, NextResponse } from "next/server";
import { BenchmarkResult } from "@/lib/types";

const PROVIDER_ENDPOINTS: Record<string, string> = {
  cerebras: "/api/benchmark/cerebras",
  fireworks: "/api/benchmark/fireworks",
  groq: "/api/benchmark/groq",
};

export async function POST(request: NextRequest) {
  try {
    const { prompt, max_tokens, providers } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const selectedProviders: string[] =
      providers && providers.length > 0
        ? providers
        : Object.keys(PROVIDER_ENDPOINTS);

    // Get the base URL from the request
    const baseUrl = new URL(request.url).origin;

    // Call all provider endpoints in parallel
    const benchmarkPromises = selectedProviders.map(async (provider) => {
      const endpoint = PROVIDER_ENDPOINTS[provider];
      if (!endpoint) {
        return {
          provider,
          model: "unknown",
          ttft_ms: 0,
          tokens_per_second: 0,
          total_latency_ms: 0,
          token_count: 0,
          error: `Unknown provider: ${provider}`,
        } as BenchmarkResult;
      }

      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt, max_tokens }),
        });

        const result: BenchmarkResult = await response.json();
        return result;
      } catch (error) {
        return {
          provider,
          model: "unknown",
          ttft_ms: 0,
          tokens_per_second: 0,
          total_latency_ms: 0,
          token_count: 0,
          error: error instanceof Error ? error.message : "Request failed",
        } as BenchmarkResult;
      }
    });

    const settledResults = await Promise.allSettled(benchmarkPromises);

    const results: BenchmarkResult[] = settledResults.map((settled, index) => {
      if (settled.status === "fulfilled") {
        return settled.value;
      }
      return {
        provider: selectedProviders[index],
        model: "unknown",
        ttft_ms: 0,
        tokens_per_second: 0,
        total_latency_ms: 0,
        token_count: 0,
        error: settled.reason?.message || "Promise rejected",
      };
    });

    // Sort by TTFT ascending (errors go to the end)
    results.sort((a, b) => {
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      return a.ttft_ms - b.ttft_ms;
    });

    return NextResponse.json({
      results,
      prompt,
      max_tokens: max_tokens || 256,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
