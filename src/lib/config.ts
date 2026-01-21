/**
 * Centralized configuration for the benchmark application.
 * All hardcoded values are consolidated here for easy maintenance.
 */

// Default request parameters
export const DEFAULTS = {
  MAX_TOKENS: 256,
  CHARS_PER_TOKEN: 4, // Approximation for token counting
  TOKEN_THRESHOLD_FOR_METRICS: 100, // Track time to reach this many tokens
} as const;

// Mock/simulation data for demo mode
export const MOCK_BENCHMARKS = {
  cerebras: {
    ttft_ms: 52,
    tokens_per_second: 2156.3,
    total_latency_ms: 127,
    token_count: 274,
    time_to_100_tokens_ms: 98,
    throughput_first_100: 1020.4,
  },
  groq: {
    ttft_ms: 186,
    tokens_per_second: 512.7,
    total_latency_ms: 534,
    token_count: 274,
    time_to_100_tokens_ms: 382,
    throughput_first_100: 261.8,
  },
  fireworks: {
    ttft_ms: 245,
    tokens_per_second: 89.4,
    total_latency_ms: 3065,
    token_count: 274,
    time_to_100_tokens_ms: 1340,
    throughput_first_100: 74.6,
  },
} as const;

// Variance settings for mock data
export const MOCK_SETTINGS = {
  DEFAULT_VARIANCE_PERCENT: 10,
  TTFT_VARIANCE_PERCENT: 15,
  TPS_VARIANCE_PERCENT: 10,
  LATENCY_VARIANCE_PERCENT: 12,
  TOKEN_COUNT_VARIANCE: 10, // +/- this many tokens
  SIMULATED_LATENCY_MIN_MS: 100,
  SIMULATED_LATENCY_MAX_MS: 300,
} as const;

// ROI Calculator use case thresholds (in milliseconds)
export const USE_CASE_THRESHOLDS = {
  voice_agent: {
    name: "Voice Agent",
    threshold: 200,
    description: "Requires <200ms TTFT for natural conversation",
  },
  code_autocomplete: {
    name: "Code Autocomplete",
    threshold: 150,
    description: "Requires <150ms TTFT for seamless typing",
  },
  customer_support: {
    name: "Customer Support Bot",
    threshold: 500,
    description: "Requires <500ms TTFT for good UX",
  },
  multi_agent: {
    name: "Multi-Agent Workflow",
    threshold: 300,
    description: "Low latency compounds across steps",
  },
  batch_processing: {
    name: "Batch Processing",
    threshold: 1000,
    description: "Throughput matters more than latency",
  },
} as const;

export type UseCaseKey = keyof typeof USE_CASE_THRESHOLDS;

// Default estimates for ROI calculator when no benchmark has been run
export const DEFAULT_PERFORMANCE_ESTIMATES: Record<string, { ttft_ms: number; tokens_per_second: number }> = {
  cerebras: { ttft_ms: 52, tokens_per_second: 2156 },
  groq: { ttft_ms: 186, tokens_per_second: 513 },
  fireworks: { ttft_ms: 245, tokens_per_second: 89 },
};

// Token count variation threshold (triggers warning if max is more than this multiple of min)
export const TOKEN_COUNT_VARIATION_RATIO = 2;

// Agent race configuration
export const AGENT_RACE_CONFIG = {
  MAX_TOKENS_PER_STEP: 150,
  OUTPUT_PREVIEW_LENGTH: 150,
} as const;

// UI Colors
export const COLORS = {
  CEREBRAS_ORANGE: "#E8613D",
  OTHER_GRAY: "#71717A",
} as const;

// Default benchmark prompt
export const DEFAULT_PROMPT =
  "Write a detailed, comprehensive explanation of how the attention mechanism works in transformer neural networks. Cover: 1) The intuition behind attention, 2) Query, Key, Value matrices, 3) Scaled dot-product attention formula, 4) Multi-head attention, 5) Self-attention vs cross-attention. Be thorough and technical.";
