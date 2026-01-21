export interface BenchmarkResult {
  provider: string;
  model: string;
  ttft_ms: number;
  tokens_per_second: number;
  total_latency_ms: number;
  token_count: number;
  time_to_100_tokens_ms?: number;
  throughput_first_100?: number;
  error?: string;
}
