import { NextRequest, NextResponse } from "next/server";
import { BenchmarkResult } from "@/lib/types";
import { providers } from "@/lib/providers";
import { MOCK_BENCHMARKS, MOCK_SETTINGS } from "@/lib/config";
import { addVariance, simulateLatency } from "@/lib/benchmark-utils";

export async function POST(request: NextRequest) {
  try {
    const { providers: selectedProviders } = await request.json();

    const providersToTest: string[] =
      selectedProviders && selectedProviders.length > 0
        ? selectedProviders
        : Object.keys(providers);

    const results: BenchmarkResult[] = [];

    for (const providerId of providersToTest) {
      const mockData = MOCK_BENCHMARKS[providerId as keyof typeof MOCK_BENCHMARKS];
      if (!mockData) continue;

      // Simulate actual API latency (scaled down for demo)
      await simulateLatency(
        MOCK_SETTINGS.SIMULATED_LATENCY_MIN_MS,
        MOCK_SETTINGS.SIMULATED_LATENCY_MAX_MS
      );

      const result: BenchmarkResult = {
        provider: providerId,
        model: providers[providerId]?.model || "unknown",
        ttft_ms: addVariance(mockData.ttft_ms, MOCK_SETTINGS.TTFT_VARIANCE_PERCENT),
        tokens_per_second: addVariance(mockData.tokens_per_second, MOCK_SETTINGS.TPS_VARIANCE_PERCENT),
        total_latency_ms: addVariance(mockData.total_latency_ms, MOCK_SETTINGS.LATENCY_VARIANCE_PERCENT),
        token_count: mockData.token_count + Math.floor(Math.random() * MOCK_SETTINGS.TOKEN_COUNT_VARIANCE * 2 - MOCK_SETTINGS.TOKEN_COUNT_VARIANCE),
        time_to_100_tokens_ms: mockData.time_to_100_tokens_ms
          ? addVariance(mockData.time_to_100_tokens_ms, MOCK_SETTINGS.LATENCY_VARIANCE_PERCENT)
          : undefined,
        throughput_first_100: mockData.throughput_first_100
          ? addVariance(mockData.throughput_first_100, MOCK_SETTINGS.TPS_VARIANCE_PERCENT)
          : undefined,
      };

      results.push(result);
    }

    // Sort by TTFT ascending
    results.sort((a, b) => a.ttft_ms - b.ttft_ms);

    return NextResponse.json({
      results,
      mock: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
