/**
 * Shared utilities for benchmark operations.
 * Consolidates common logic used across provider routes.
 */

import { BenchmarkResult } from "./types";
import { DEFAULTS } from "./config";

/**
 * Tracks timing metrics during streaming responses.
 */
export interface StreamMetrics {
  startTime: number;
  firstTokenTime: number | null;
  timeToHundredTokens: number | null;
  tokenCount: number;
  fullResponse: string;
}

/**
 * Creates initial metrics state for stream processing.
 */
export function createStreamMetrics(): StreamMetrics {
  return {
    startTime: performance.now(),
    firstTokenTime: null,
    timeToHundredTokens: null,
    tokenCount: 0,
    fullResponse: "",
  };
}

/**
 * Updates metrics when content is received from stream.
 */
export function updateMetrics(metrics: StreamMetrics, content: string): void {
  if (metrics.firstTokenTime === null) {
    metrics.firstTokenTime = performance.now();
  }

  metrics.fullResponse += content;
  metrics.tokenCount = estimateTokenCount(metrics.fullResponse);

  if (metrics.tokenCount >= DEFAULTS.TOKEN_THRESHOLD_FOR_METRICS && metrics.timeToHundredTokens === null) {
    metrics.timeToHundredTokens = performance.now() - metrics.startTime;
  }
}

/**
 * Estimates token count from text length.
 * Uses approximation of ~4 characters per token.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / DEFAULTS.CHARS_PER_TOKEN);
}

/**
 * Calculates final benchmark metrics from stream data.
 */
export function calculateBenchmarkMetrics(metrics: StreamMetrics): {
  ttftMs: number;
  totalLatencyMs: number;
  tokensPerSecond: number;
  throughputFirst100: number | null;
} {
  const endTime = performance.now();
  const ttftMs = metrics.firstTokenTime
    ? metrics.firstTokenTime - metrics.startTime
    : endTime - metrics.startTime;
  const totalLatencyMs = endTime - metrics.startTime;

  const tokensPerSecond = metrics.tokenCount > 0 && totalLatencyMs > 0
    ? (metrics.tokenCount / totalLatencyMs) * 1000
    : 0;

  const throughputFirst100 = metrics.timeToHundredTokens
    ? (DEFAULTS.TOKEN_THRESHOLD_FOR_METRICS / (metrics.timeToHundredTokens / 1000))
    : null;

  return {
    ttftMs,
    totalLatencyMs,
    tokensPerSecond,
    throughputFirst100,
  };
}

/**
 * Builds a successful benchmark result object.
 */
export function buildSuccessResult(
  provider: string,
  model: string,
  metrics: StreamMetrics
): BenchmarkResult {
  const calculated = calculateBenchmarkMetrics(metrics);

  return {
    provider,
    model,
    ttft_ms: Math.round(calculated.ttftMs),
    tokens_per_second: roundToOneDecimal(calculated.tokensPerSecond),
    total_latency_ms: Math.round(calculated.totalLatencyMs),
    token_count: metrics.tokenCount,
    time_to_100_tokens_ms: metrics.timeToHundredTokens
      ? Math.round(metrics.timeToHundredTokens)
      : undefined,
    throughput_first_100: calculated.throughputFirst100
      ? roundToOneDecimal(calculated.throughputFirst100)
      : undefined,
  };
}

/**
 * Builds an error benchmark result object.
 */
export function buildErrorResult(
  provider: string,
  model: string,
  error: unknown,
  startTime: number
): BenchmarkResult {
  const totalLatencyMs = performance.now() - startTime;
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  return {
    provider,
    model,
    ttft_ms: 0,
    tokens_per_second: 0,
    total_latency_ms: Math.round(totalLatencyMs),
    token_count: 0,
    error: errorMessage,
  };
}

/**
 * Rounds a number to one decimal place.
 */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Processes SSE stream lines and extracts content.
 * Returns parsed content or null if line should be skipped.
 */
export function parseSSELine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data: ")) return null;

  const data = trimmed.slice(6);
  if (data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content || null;
  } catch {
    return null;
  }
}

/**
 * Creates a stream reader with proper cleanup handling.
 * Returns an async generator that yields content chunks.
 */
export async function* createStreamReader(
  response: Response
): AsyncGenerator<string, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const content = parseSSELine(line);
        if (content) {
          yield content;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const content = parseSSELine(buffer);
      if (content) {
        yield content;
      }
    }
  } finally {
    // Ensure reader is always released
    reader.releaseLock();
  }
}

/**
 * Validates required API key and returns it.
 * Throws with consistent error message if not configured.
 */
export function getRequiredApiKey(envVar: string): string {
  const apiKey = process.env[envVar];
  if (!apiKey) {
    throw new BenchmarkError(`${envVar} not configured`, "CONFIG_ERROR");
  }
  return apiKey;
}

/**
 * Custom error class for benchmark operations.
 */
export class BenchmarkError extends Error {
  constructor(
    message: string,
    public readonly code: "CONFIG_ERROR" | "API_ERROR" | "STREAM_ERROR" | "UNKNOWN_ERROR"
  ) {
    super(message);
    this.name = "BenchmarkError";
  }
}

/**
 * Wraps an API error with consistent formatting.
 */
export function createApiError(provider: string, status: number, body: string): BenchmarkError {
  return new BenchmarkError(
    `${provider} API error: ${status} - ${body}`,
    "API_ERROR"
  );
}

/**
 * Adds variance to a value for mock data simulation.
 */
export function addVariance(value: number, variancePercent: number): number {
  const variance = value * (variancePercent / 100);
  const delta = (Math.random() - 0.5) * 2 * variance;
  return roundToOneDecimal(value + delta);
}

/**
 * Simulates latency for mock responses.
 */
export function simulateLatency(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
