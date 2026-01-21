"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { Play, Loader2, Zap, Trophy, Gauge, Github, CheckCircle2, XCircle, Clock, AlertCircle, ArrowRight, Calculator, Info, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";
import { providers } from "@/lib/providers";
import { BenchmarkResult } from "@/lib/types";
import { useBenchmark } from "@/lib/context/BenchmarkContext";
import {
  DEFAULT_PROMPT,
  COLORS,
  USE_CASE_THRESHOLDS,
  DEFAULT_PERFORMANCE_ESTIMATES,
  TOKEN_COUNT_VARIATION_RATIO,
  DEFAULTS,
} from "@/lib/config";

const CEREBRAS_ORANGE = COLORS.CEREBRAS_ORANGE;
const OTHER_GRAY = COLORS.OTHER_GRAY;

const AGENT_STEPS = ["Research", "Summarize", "Draft", "Critique", "Revise"];
const AGENT_PROVIDERS = ["cerebras", "groq", "fireworks"] as const;
type AgentProvider = (typeof AGENT_PROVIDERS)[number];

interface AgentStepStatus {
  step: number;
  name: string;
  status: "pending" | "running" | "complete" | "error";
  latency_ms?: number;
  output_preview?: string;
  error?: string;
}

interface AgentRaceState {
  steps: AgentStepStatus[];
  totalLatency: number;
  complete: boolean;
  error?: string;
}

// Use config values for ROI Calculator
const USE_CASES = USE_CASE_THRESHOLDS;
type UseCaseKey = keyof typeof USE_CASE_THRESHOLDS;
const DEFAULT_ESTIMATES = DEFAULT_PERFORMANCE_ESTIMATES;

export default function Home() {
  // Benchmark context
  const { results: savedResults, lastRun, setResults: saveResults } = useBenchmark();

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [selectedProviders, setSelectedProviders] = useState<string[]>(
    Object.keys(providers)
  );
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [isMockData, setIsMockData] = useState(false);
  const [activeTab, setActiveTab] = useState<"benchmark" | "agent-race" | "roi">("benchmark");

  // Agent Race state
  const [companyName, setCompanyName] = useState("Anthropic");
  const [selectedAgentProviders, setSelectedAgentProviders] = useState<AgentProvider[]>(["cerebras", "groq"]);
  const [agentRaces, setAgentRaces] = useState<Record<AgentProvider, AgentRaceState>>({} as Record<AgentProvider, AgentRaceState>);
  const [isRacing, setIsRacing] = useState(false);
  const [raceWinner, setRaceWinner] = useState<AgentProvider | null>(null);
  const [showAgentInfo, setShowAgentInfo] = useState(false);

  // ROI Calculator state
  const [selectedUseCase, setSelectedUseCase] = useState<UseCaseKey>("voice_agent");

  const toggleProvider = (providerId: string) => {
    setSelectedProviders((prev) =>
      prev.includes(providerId)
        ? prev.filter((p) => p !== providerId)
        : [...prev, providerId]
    );
  };

  const runBenchmark = async () => {
    if (selectedProviders.length === 0 || !prompt.trim()) return;

    setIsLoading(true);
    setResults([]);
    setIsMockData(false);
    setCurrentProvider(demoMode ? "simulating" : "all providers");

    try {
      const endpoint = demoMode ? "/api/benchmark/mock" : "/api/benchmark";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          max_tokens: DEFAULTS.MAX_TOKENS,
          providers: selectedProviders,
        }),
      });

      const data = await response.json();
      if (data.results) {
        setResults(data.results);
        setIsMockData(data.mock === true);
        // Save to context for ROI Calculator (only save real results, not mock)
        if (!data.mock) {
          saveResults(data.results);
        }
      }
    } catch {
      // Error is captured by the benchmark results with error field
      // No need to log here as results will show the error state
    } finally {
      setIsLoading(false);
      setCurrentProvider(null);
    }
  };

  const toggleAgentProvider = (provider: AgentProvider) => {
    setSelectedAgentProviders((prev) =>
      prev.includes(provider)
        ? prev.filter((p) => p !== provider)
        : [...prev, provider]
    );
  };

  const runAgentRace = async () => {
    if (selectedAgentProviders.length === 0 || !companyName.trim()) return;

    setIsRacing(true);
    setRaceWinner(null);

    // Initialize race states
    const initialState: AgentRaceState = {
      steps: AGENT_STEPS.map((name, i) => ({
        step: i + 1,
        name,
        status: "pending",
      })),
      totalLatency: 0,
      complete: false,
    };

    const initialRaces: Record<AgentProvider, AgentRaceState> = {} as Record<AgentProvider, AgentRaceState>;
    selectedAgentProviders.forEach((p) => {
      initialRaces[p] = { ...initialState, steps: [...initialState.steps.map(s => ({ ...s }))] };
    });
    setAgentRaces(initialRaces);

    // Start races in parallel
    const racePromises = selectedAgentProviders.map(async (provider) => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const response = await fetch("/api/agent-race", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, company: companyName.trim() }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        reader = response.body?.getReader() ?? null;
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);

            try {
              const parsed = JSON.parse(data);

              setAgentRaces((prev) => {
                const current = prev[provider];
                if (!current) return prev;

                if (parsed.complete) {
                  // Race completed for this provider
                  const updated = {
                    ...current,
                    totalLatency: parsed.total_latency_ms,
                    complete: true,
                  };

                  // Check if this is the winner
                  setRaceWinner((prevWinner) => {
                    if (prevWinner === null) return provider;
                    return prevWinner;
                  });

                  return { ...prev, [provider]: updated };
                }

                // Update step status
                const updatedSteps = current.steps.map((step) =>
                  step.step === parsed.step
                    ? {
                        ...step,
                        status: parsed.status,
                        latency_ms: parsed.latency_ms,
                        output_preview: parsed.output_preview,
                        error: parsed.error,
                      }
                    : step
                );

                return {
                  ...prev,
                  [provider]: { ...current, steps: updatedSteps },
                };
              });
            } catch {
              // Skip invalid JSON
            }
          }
        }

        return { provider, success: true };
      } catch (error) {
        setAgentRaces((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }));
        return { provider, success: false };
      } finally {
        // Ensure reader is always released to prevent memory leaks
        reader?.releaseLock();
      }
    });

    await Promise.all(racePromises);
    setIsRacing(false);
  };

  // Calculate stats
  const validResults = results.filter((r) => !r.error);
  const fastestTTFT = validResults.length
    ? validResults.reduce((a, b) => (a.ttft_ms < b.ttft_ms ? a : b))
    : null;
  const slowestTTFT = validResults.length
    ? validResults.reduce((a, b) => (a.ttft_ms > b.ttft_ms ? a : b))
    : null;
  const highestThroughput = validResults.length
    ? validResults.reduce((a, b) =>
        a.tokens_per_second > b.tokens_per_second ? a : b
      )
    : null;

  const cerebrasResult = validResults.find((r) => r.provider === "cerebras");
  const speedAdvantage =
    cerebrasResult && slowestTTFT && slowestTTFT.provider !== "cerebras"
      ? (slowestTTFT.ttft_ms / cerebrasResult.ttft_ms).toFixed(1)
      : null;

  // Chart data with colors
  const getBarColor = (provider: string) =>
    provider === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY;

  const ttftChartData = validResults.map((r) => ({
    name: providers[r.provider]?.name || r.provider,
    value: r.ttft_ms,
    fill: getBarColor(r.provider),
    provider: r.provider,
  }));

  const tpsChartData = validResults.map((r) => ({
    name: providers[r.provider]?.name || r.provider,
    value: r.tokens_per_second,
    fill: getBarColor(r.provider),
    provider: r.provider,
  }));

  // Find best values for highlighting
  const bestTTFT = validResults.length
    ? Math.min(...validResults.map((r) => r.ttft_ms))
    : 0;
  const bestTPS = validResults.length
    ? Math.max(...validResults.map((r) => r.tokens_per_second))
    : 0;
  const bestLatency = validResults.length
    ? Math.min(...validResults.map((r) => r.total_latency_ms))
    : 0;

  // Check if token counts differ significantly (ratio-based: triggers if max > 2x min)
  const tokenCounts = validResults.map((r) => r.token_count);
  const maxTokens = Math.max(...tokenCounts, 0);
  const minTokens = Math.min(...tokenCounts, 0);
  const tokenCountsVary = minTokens > 0 && maxTokens / minTokens > TOKEN_COUNT_VARIATION_RATIO;

  // Get best throughput for first 100 tokens (normalized comparison)
  const bestThroughput100 = validResults.length
    ? validResults.reduce((best, r) => {
        const t100 = r.throughput_first_100 ?? r.tokens_per_second;
        const bestT100 = best.throughput_first_100 ?? best.tokens_per_second;
        return t100 > bestT100 ? r : best;
      })
    : null;

  return (
    <div className="gradient-bg h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border py-4 px-6 shrink-0">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium mb-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Real API calls • Same model (Llama 70B) • Same prompt
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-1"
          >
            The Cerebras{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-secondary">
              Advantage Calculator
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-foreground-muted"
          >
            Live inference benchmarks across providers
          </motion.p>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-border px-6 shrink-0">
        <div className="max-w-6xl mx-auto flex gap-1 justify-center">
          <button
            onClick={() => setActiveTab("benchmark")}
            className={clsx(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "benchmark"
                ? "border-b-2 border-accent text-accent"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            Benchmark
          </button>
          <button
            onClick={() => setActiveTab("agent-race")}
            className={clsx(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "agent-race"
                ? "border-b-2 border-accent text-accent"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            Agent Race
          </button>
          <button
            onClick={() => setActiveTab("roi")}
            className={clsx(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "roi"
                ? "border-b-2 border-accent text-accent"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            ROI Calculator
          </button>
        </div>
      </div>

      <main className="flex-1 px-6 py-4 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Benchmark Tab */}
          {activeTab === "benchmark" && (
            <>
              {/* Controls Section */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Prompt Input */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Test Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-28 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent resize-none"
                  placeholder="Enter your prompt..."
                />
              </div>

              {/* Provider Selection & Run */}
              <div className="flex flex-col gap-3 lg:w-auto">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(providers).map(([id, config]) => (
                    <button
                      key={id}
                      onClick={() => toggleProvider(id)}
                      className={clsx(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs",
                        selectedProviders.includes(id)
                          ? "border-transparent bg-white/10"
                          : "border-border bg-transparent opacity-50 hover:opacity-75"
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            id === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY,
                        }}
                      />
                      <span className="font-medium text-foreground">
                        {config.name}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Demo Mode Toggle & Run Button */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={demoMode}
                      onChange={(e) => setDemoMode(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-border bg-background accent-accent"
                    />
                    <span className="text-[10px] text-foreground-muted">Demo Mode</span>
                  </label>
                  <button
                    onClick={runBenchmark}
                    disabled={isLoading || selectedProviders.length === 0}
                    className={clsx(
                      "flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-300",
                      isLoading || selectedProviders.length === 0
                        ? "bg-foreground-muted/20 text-foreground-muted cursor-not-allowed"
                        : "bg-gradient-to-r from-accent to-accent-secondary text-white hover:shadow-lg hover:shadow-accent/25"
                    )}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {demoMode ? "Simulating..." : "Testing..."}
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        {demoMode ? "Run Demo" : "Run Benchmark"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Results Section */}
          <AnimatePresence>
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-2"
              >
                {/* Mock Data Badge */}
                {isMockData && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-center gap-2 py-1"
                  >
                    <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-[10px] font-medium text-purple-400">
                      SIMULATED DATA
                    </span>
                    <span className="text-[10px] text-foreground-muted">
                      Based on expected real-world performance
                    </span>
                  </motion.div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Fastest TTFT */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-card border border-border rounded-lg p-2.5"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[10px] font-medium text-foreground-muted">
                        Fastest TTFT
                      </span>
                    </div>
                    {fastestTTFT && (
                      <div className="flex items-baseline gap-1.5">
                        <div className="text-lg font-bold text-foreground">
                          {fastestTTFT.ttft_ms}ms
                        </div>
                        <div
                          className="text-[10px] font-medium"
                          style={{ color: getBarColor(fastestTTFT.provider) }}
                        >
                          {providers[fastestTTFT.provider]?.name}
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* Speed Advantage */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card border border-border rounded-lg p-2.5"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Trophy className="w-3.5 h-3.5 text-accent" />
                      <span className="text-[10px] font-medium text-foreground-muted">
                        Speed Advantage
                      </span>
                    </div>
                    {speedAdvantage ? (
                      <div className="flex items-baseline gap-1.5">
                        <div className="text-lg font-bold text-foreground">
                          {speedAdvantage}x
                        </div>
                        <div className="text-[10px] text-foreground-muted">
                          vs {providers[slowestTTFT!.provider]?.name}
                        </div>
                      </div>
                    ) : (
                      <div className="text-base font-bold text-foreground-muted">—</div>
                    )}
                  </motion.div>

                  {/* Highest Throughput */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-lg p-2.5"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Gauge className="w-3.5 h-3.5 text-purple-500" />
                      <span className="text-[10px] font-medium text-foreground-muted">
                        {tokenCountsVary ? "Throughput (first 100)" : "Highest Throughput"}
                      </span>
                    </div>
                    {(tokenCountsVary ? bestThroughput100 : highestThroughput) && (
                      <div className="flex items-baseline gap-1.5">
                        <div className="text-lg font-bold text-foreground">
                          {tokenCountsVary
                            ? (bestThroughput100?.throughput_first_100 ?? bestThroughput100?.tokens_per_second)
                            : highestThroughput?.tokens_per_second} tok/s
                        </div>
                        <div
                          className="text-[10px] font-medium"
                          style={{
                            color: getBarColor(
                              (tokenCountsVary ? bestThroughput100?.provider : highestThroughput?.provider) || ""
                            ),
                          }}
                        >
                          {providers[(tokenCountsVary ? bestThroughput100?.provider : highestThroughput?.provider) || ""]?.name}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Token Count Warning */}
                {tokenCountsVary && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg"
                  >
                    <span className="text-amber-500 text-xs">⚠️</span>
                    <span className="text-[10px] text-amber-500/90">
                      Token counts differ significantly ({minTokens}-{maxTokens}) - throughput comparison normalized to first 100 tokens
                    </span>
                  </motion.div>
                )}

                {/* Charts */}
                <div className="grid grid-cols-2 gap-2">
                  {/* TTFT Chart */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-card border border-border rounded-lg p-3"
                  >
                    <h3 className="text-xs font-semibold text-foreground mb-1">
                      Time to First Token
                    </h3>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={ttftChartData}
                          margin={{ top: 15, right: 5, left: 0, bottom: 30 }}
                        >
                          <XAxis
                            dataKey="name"
                            stroke="#71717a"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            angle={-45}
                            textAnchor="end"
                            height={30}
                            interval={0}
                          />
                          <YAxis
                            stroke="#71717a"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            width={30}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#18181b",
                              border: "1px solid #27272a",
                              borderRadius: "8px",
                            }}
                            labelStyle={{ color: "#fafafa" }}
                            itemStyle={{ color: "#fdba74" }}
                            formatter={(value) => [`${value}ms`, "TTFT"]}
                          />
                          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}>
                            <LabelList
                              dataKey="value"
                              position="top"
                              fill="#fafafa"
                              fontSize={9}
                              fontWeight={600}
                            />
                            {ttftChartData.map((entry) => (
                              <Cell key={entry.provider} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>

                  {/* Tokens/sec Chart */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-card border border-border rounded-lg p-3"
                  >
                    <h3 className="text-xs font-semibold text-foreground mb-1">
                      Tokens per Second
                    </h3>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={tpsChartData}
                          margin={{ top: 15, right: 5, left: 0, bottom: 30 }}
                        >
                          <XAxis
                            dataKey="name"
                            stroke="#71717a"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            angle={-45}
                            textAnchor="end"
                            height={30}
                            interval={0}
                          />
                          <YAxis
                            stroke="#71717a"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            width={30}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#18181b",
                              border: "1px solid #27272a",
                              borderRadius: "8px",
                            }}
                            labelStyle={{ color: "#fafafa" }}
                            itemStyle={{ color: "#fdba74" }}
                            formatter={(value) => [
                              `${value} tok/s`,
                              "Throughput",
                            ]}
                          />
                          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}>
                            <LabelList
                              dataKey="value"
                              position="top"
                              fill="#fafafa"
                              fontSize={9}
                              fontWeight={600}
                            />
                            {tpsChartData.map((entry) => (
                              <Cell key={entry.provider} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                </div>

                {/* Results Table */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="bg-card border border-border rounded-lg overflow-hidden"
                >
                  <div className="px-3 py-1.5 border-b border-border">
                    <h3 className="text-xs font-semibold text-foreground">
                      Detailed Results
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">
                            Provider
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">
                            TTFT
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">
                            Tok/s
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">
                            Latency
                          </th>
                          <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-foreground-muted uppercase tracking-wider">
                            Tokens
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result, index) => (
                          <tr
                            key={`result-${result.provider}-${index}`}
                            className={clsx(
                              "border-b border-border/50",
                              index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                            )}
                          >
                            <td className="px-3 py-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: getBarColor(result.provider) }}
                                />
                                <span className="text-xs font-medium text-foreground">
                                  {providers[result.provider]?.name || result.provider}
                                </span>
                                {result.error && (
                                  <span className="text-[10px] text-red-400 bg-red-400/10 px-1 rounded">
                                    Error
                                  </span>
                                )}
                              </div>
                            </td>
                            <td
                              className={clsx(
                                "px-3 py-1 text-right text-xs font-mono",
                                result.ttft_ms === bestTTFT && !result.error
                                  ? "text-emerald-400 bg-emerald-400/10"
                                  : "text-foreground"
                              )}
                            >
                              {result.error ? "—" : result.ttft_ms}
                            </td>
                            <td
                              className={clsx(
                                "px-3 py-1 text-right text-xs font-mono",
                                result.tokens_per_second === bestTPS && !result.error
                                  ? "text-emerald-400 bg-emerald-400/10"
                                  : "text-foreground"
                              )}
                            >
                              {result.error ? "—" : result.tokens_per_second}
                            </td>
                            <td
                              className={clsx(
                                "px-3 py-1 text-right text-xs font-mono",
                                result.total_latency_ms === bestLatency && !result.error
                                  ? "text-emerald-400 bg-emerald-400/10"
                                  : "text-foreground"
                              )}
                            >
                              {result.error ? "—" : `${result.total_latency_ms}ms`}
                            </td>
                            <td className="px-3 py-1 text-right text-xs font-mono text-foreground">
                              {result.error ? "—" : result.token_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty State */}
          {results.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-card border border-border mb-3">
                <Zap className="w-6 h-6 text-foreground-muted" />
              </div>
              <p className="text-foreground-muted text-sm">
                Run a benchmark to see results
              </p>
            </motion.div>
          )}
            </>
          )}

          {/* Agent Race Tab */}
          {activeTab === "agent-race" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Controls */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-col lg:flex-row gap-4">
                  {/* Company Input */}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-foreground-muted mb-1">
                      Target Company
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                      placeholder="Enter company name..."
                    />
                    <p className="text-[10px] text-foreground-muted mt-1">
                      Agents will research this company and draft an outreach email
                    </p>
                  </div>

                  {/* Provider Selection & Run */}
                  <div className="flex flex-col gap-3 lg:w-auto">
                    <div className="flex flex-wrap gap-2">
                      {AGENT_PROVIDERS.map((id) => (
                        <button
                          key={id}
                          onClick={() => toggleAgentProvider(id)}
                          className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs",
                            selectedAgentProviders.includes(id)
                              ? "border-transparent bg-white/10"
                              : "border-border bg-transparent opacity-50 hover:opacity-75"
                          )}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: id === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY,
                            }}
                          />
                          <span className="font-medium text-foreground capitalize">
                            {id}
                          </span>
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={runAgentRace}
                      disabled={isRacing || selectedAgentProviders.length === 0 || !companyName.trim()}
                      className={clsx(
                        "flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-300",
                        isRacing || selectedAgentProviders.length === 0 || !companyName.trim()
                          ? "bg-foreground-muted/20 text-foreground-muted cursor-not-allowed"
                          : "bg-gradient-to-r from-accent to-accent-secondary text-white hover:shadow-lg hover:shadow-accent/25"
                      )}
                    >
                      {isRacing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Racing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Start Race
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* How It Works Info Box */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAgentInfo(!showAgentInfo)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium text-foreground">How does this work?</span>
                  </div>
                  {showAgentInfo ? (
                    <ChevronUp className="w-4 h-4 text-foreground-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-foreground-muted" />
                  )}
                </button>

                <AnimatePresence>
                  {showAgentInfo && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                        {/* Real LLM Calls Badge */}
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[10px] font-medium text-emerald-400">
                            REAL API CALLS
                          </span>
                          <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] font-medium text-amber-400">
                            NOT AUTONOMOUS AGENTS
                          </span>
                        </div>

                        {/* Explanation */}
                        <div className="space-y-2 text-xs text-foreground-muted">
                          <p>
                            <span className="text-foreground font-medium">What&apos;s happening:</span> Each provider makes{" "}
                            <span className="text-foreground">5 real LLM API calls</span> in sequence. The output of each step becomes the input for the next step.
                          </p>

                          <div className="bg-background/50 rounded-lg p-3 font-mono text-[10px] space-y-1">
                            <div className="text-foreground-muted">Step 1: Research → <span className="text-foreground">&quot;Find 3 key facts about {`{company}`}...&quot;</span></div>
                            <div className="text-foreground-muted">Step 2: Summarize → <span className="text-foreground">&quot;Summarize this research...&quot;</span> + Step 1 output</div>
                            <div className="text-foreground-muted">Step 3: Draft → <span className="text-foreground">&quot;Write a cold email...&quot;</span> + Step 2 output</div>
                            <div className="text-foreground-muted">Step 4: Critique → <span className="text-foreground">&quot;List 3 improvements...&quot;</span> + Step 3 output</div>
                            <div className="text-foreground-muted">Step 5: Revise → <span className="text-foreground">&quot;Apply improvements...&quot;</span> + Step 4 output</div>
                          </div>

                          <p>
                            <span className="text-foreground font-medium">Why it&apos;s not an &quot;agent&quot;:</span> Real AI agents make autonomous decisions—choosing tools, planning steps, looping when needed. This is a{" "}
                            <span className="text-foreground">fixed prompt chain</span> with no decision-making, no tool use, and no dynamic planning.
                          </p>

                          <p>
                            <span className="text-foreground font-medium">Why we built it this way:</span> The goal is to benchmark{" "}
                            <span className="text-foreground">multi-step inference latency</span>—how provider speed compounds across sequential LLM calls.
                            In real agent workflows, faster inference means faster iteration loops, which is what this simulates.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Race Visualization */}
              {Object.keys(agentRaces).length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {selectedAgentProviders.map((provider) => {
                    const race = agentRaces[provider];
                    if (!race) return null;

                    const isWinner = raceWinner === provider;
                    const completedSteps = race.steps.filter((s) => s.status === "complete").length;

                    return (
                      <motion.div
                        key={provider}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={clsx(
                          "bg-card border rounded-xl p-4 relative overflow-hidden",
                          isWinner
                            ? "border-emerald-500 ring-2 ring-emerald-500/20"
                            : "border-border"
                        )}
                      >
                        {/* Winner Badge */}
                        {isWinner && (
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-bl-lg">
                            WINNER
                          </div>
                        )}

                        {/* Provider Header */}
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: provider === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY,
                            }}
                          />
                          <span className="text-sm font-bold text-foreground capitalize">
                            {provider}
                          </span>
                          {race.complete && (
                            <span className="ml-auto text-xs font-mono text-foreground-muted">
                              {race.totalLatency}ms total
                            </span>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="h-1.5 bg-background rounded-full mb-3 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: provider === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY,
                            }}
                            initial={{ width: "0%" }}
                            animate={{ width: `${(completedSteps / AGENT_STEPS.length) * 100}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>

                        {/* Steps */}
                        <div className="space-y-2">
                          {race.steps.map((step) => (
                            <div
                              key={step.step}
                              className={clsx(
                                "flex items-center gap-2 p-2 rounded-lg transition-colors",
                                step.status === "running" && "bg-accent/10",
                                step.status === "complete" && "bg-emerald-500/10",
                                step.status === "error" && "bg-red-500/10"
                              )}
                            >
                              {/* Status Icon */}
                              <div className="shrink-0">
                                {step.status === "pending" && (
                                  <Clock className="w-3.5 h-3.5 text-foreground-muted" />
                                )}
                                {step.status === "running" && (
                                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                                )}
                                {step.status === "complete" && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                )}
                                {step.status === "error" && (
                                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                                )}
                              </div>

                              {/* Step Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span
                                    className={clsx(
                                      "text-xs font-medium",
                                      step.status === "pending"
                                        ? "text-foreground-muted"
                                        : "text-foreground"
                                    )}
                                  >
                                    {step.name}
                                  </span>
                                  {step.latency_ms && (
                                    <span className="text-[10px] font-mono text-foreground-muted">
                                      {step.latency_ms}ms
                                    </span>
                                  )}
                                </div>
                                {step.output_preview && (
                                  <p className="text-[10px] text-foreground-muted truncate mt-0.5">
                                    {step.output_preview}
                                  </p>
                                )}
                                {step.error && (
                                  <p className="text-[10px] text-red-400 truncate mt-0.5">
                                    {step.error}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Error State */}
                        {race.error && (
                          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-[10px] text-red-400">{race.error}</p>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Empty State */}
              {Object.keys(agentRaces).length === 0 && !isRacing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-card border border-border rounded-xl p-8 text-center"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 border border-accent/20 mb-3">
                    <Play className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    Multi-Step Agent Race
                  </h3>
                  <p className="text-foreground-muted text-xs max-w-md mx-auto">
                    Watch AI agents compete through a 5-step workflow: Research → Summarize → Draft → Critique → Revise.
                    See how Cerebras speed compounds across sequential tasks.
                  </p>
                </motion.div>
              )}

              {/* Results Summary */}
              {raceWinner && !isRacing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-emerald-500/10 to-accent/10 border border-emerald-500/20 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-emerald-500" />
                    <div>
                      <h3 className="text-sm font-bold text-foreground capitalize">
                        {raceWinner} wins!
                      </h3>
                      <p className="text-xs text-foreground-muted">
                        Completed all 5 steps in{" "}
                        <span className="font-mono font-semibold text-foreground">
                          {agentRaces[raceWinner]?.totalLatency}ms
                        </span>
                        {selectedAgentProviders.length > 1 && (
                          <>
                            {" — "}
                            {(() => {
                              const others = selectedAgentProviders.filter((p) => p !== raceWinner);
                              const otherTimes = others
                                .map((p) => agentRaces[p]?.totalLatency)
                                .filter((t) => t && t > 0);
                              if (otherTimes.length === 0) return null;
                              const slowest = Math.max(...otherTimes);
                              const winnerTime = agentRaces[raceWinner]?.totalLatency || 1;
                              const speedup = (slowest / winnerTime).toFixed(1);
                              return (
                                <span className="text-emerald-400 font-semibold">
                                  {speedup}x faster
                                </span>
                              );
                            })()}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ROI Calculator Tab */}
          {activeTab === "roi" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Banner if no benchmark results */}
              {savedResults.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-3 bg-accent/10 border border-accent/20 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-accent" />
                    <span className="text-sm text-foreground">
                      Run a live benchmark for accurate results
                    </span>
                    <span className="text-xs text-foreground-muted">
                      (using default estimates)
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab("benchmark")}
                    className="flex items-center gap-1 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 transition-colors"
                  >
                    Go to Benchmark
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </motion.div>
              )}

              {/* Last benchmarked indicator */}
              {lastRun && (
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  <Clock className="w-3 h-3" />
                  <span>
                    Last benchmarked:{" "}
                    {(() => {
                      const mins = Math.round((Date.now() - lastRun.getTime()) / 60000);
                      if (mins < 1) return "just now";
                      if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
                      const hours = Math.round(mins / 60);
                      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
                    })()}
                  </span>
                  {lastRun && Date.now() - lastRun.getTime() > 30 * 60 * 1000 && (
                    <span className="text-amber-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Consider re-running
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LEFT COLUMN - Inputs */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
                  </div>

                  {/* Use Case Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted mb-1">
                      Use Case
                    </label>
                    <select
                      value={selectedUseCase}
                      onChange={(e) => setSelectedUseCase(e.target.value as UseCaseKey)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                    >
                      {Object.entries(USE_CASES).map(([key, config]) => (
                        <option key={key} value={key}>
                          {config.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-foreground-muted mt-1">
                      {USE_CASES[selectedUseCase].description}
                    </p>
                  </div>
                </div>

                {/* RIGHT COLUMN - Outputs */}
                <div className="space-y-3">
                  {/* Card 1: User Experience Impact */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-accent" />
                      User Experience Impact
                    </h4>
                    <div className="space-y-2">
                      {Object.keys(providers).map((providerId) => {
                        const benchResult = savedResults.find((r) => r.provider === providerId);
                        const ttft = benchResult?.ttft_ms ?? DEFAULT_ESTIMATES[providerId]?.ttft_ms ?? 500;
                        const threshold = USE_CASES[selectedUseCase].threshold;

                        let status: "good" | "warning" | "bad";
                        let label: string;
                        if (ttft < threshold) {
                          status = "good";
                          label = "Feels instant";
                        } else if (ttft < threshold * 2) {
                          status = "warning";
                          label = "Noticeable delay";
                        } else {
                          status = "bad";
                          label = "Poor UX";
                        }

                        return (
                          <div
                            key={providerId}
                            className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-background/50"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    providerId === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY,
                                }}
                              />
                              <span className="text-xs font-medium text-foreground">
                                {providers[providerId]?.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-foreground-muted">
                                {ttft}ms
                              </span>
                              <span
                                className={clsx(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                  status === "good" && "bg-emerald-500/20 text-emerald-400",
                                  status === "warning" && "bg-amber-500/20 text-amber-400",
                                  status === "bad" && "bg-red-500/20 text-red-400"
                                )}
                              >
                                {status === "good" && "✓"} {label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Card 2: The Bottom Line */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-r from-accent/10 to-purple-500/10 border border-accent/20 rounded-xl p-4"
                  >
                    <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Trophy className="w-3.5 h-3.5 text-accent" />
                      The Bottom Line
                    </h4>
                    {(() => {
                      const threshold = USE_CASES[selectedUseCase].threshold;
                      const viableProviders = Object.keys(providers).filter((id) => {
                        const result = savedResults.find((r) => r.provider === id);
                        const ttft = result?.ttft_ms ?? DEFAULT_ESTIMATES[id]?.ttft_ms ?? 500;
                        return ttft < threshold;
                      });
                      const nonViableProviders = Object.keys(providers).filter(
                        (id) => !viableProviders.includes(id)
                      );

                      return (
                        <p className="text-xs text-foreground-muted leading-relaxed">
                          For <span className="font-semibold text-foreground">{USE_CASES[selectedUseCase].name}</span>,{" "}
                          {viableProviders.length > 0 ? (
                            <>
                              <span className="text-emerald-400 font-medium">
                                {viableProviders.map((id) => providers[id]?.name).join(" and ")}
                              </span>{" "}
                              meet the {"<"}{threshold}ms TTFT requirement.
                            </>
                          ) : (
                            <span className="text-red-400">no providers meet the requirement</span>
                          )}
                          {nonViableProviders.length > 0 && viableProviders.length > 0 && (
                            <>
                              {" "}
                              <span className="text-red-400 font-medium">
                                {nonViableProviders.map((id) => providers[id]?.name).join(", ")}
                              </span>{" "}
                              cannot support this use case without degrading UX.
                            </>
                          )}
                        </p>
                      );
                    })()}
                  </motion.div>

                  {/* Card 3: Use Case Viability */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Use Case Viability
                    </h4>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-[10px] font-semibold text-foreground-muted pb-2">
                            Provider
                          </th>
                          <th className="text-right text-[10px] font-semibold text-foreground-muted pb-2">
                            TTFT
                          </th>
                          <th className="text-center text-[10px] font-semibold text-foreground-muted pb-2">
                            Viable?
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(providers).map((providerId) => {
                          const benchResult = savedResults.find((r) => r.provider === providerId);
                          const ttft = benchResult?.ttft_ms ?? DEFAULT_ESTIMATES[providerId]?.ttft_ms ?? 500;
                          const threshold = USE_CASES[selectedUseCase].threshold;
                          const isViable = ttft < threshold;

                          return (
                            <tr key={providerId} className="border-b border-border/50">
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor:
                                        providerId === "cerebras" ? CEREBRAS_ORANGE : OTHER_GRAY,
                                    }}
                                  />
                                  <span className="text-xs text-foreground">
                                    {providers[providerId]?.name}
                                  </span>
                                </div>
                              </td>
                              <td className="text-right text-xs font-mono text-foreground-muted py-2">
                                {ttft}ms
                              </td>
                              <td className="text-center py-2">
                                {isViable ? (
                                  <span className="text-lg text-emerald-500">✓</span>
                                ) : (
                                  <span className="text-lg text-red-500">✗</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 px-6 shrink-0">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-foreground-muted text-xs flex items-center justify-center gap-2 flex-wrap">
            <span>
              Built by{" "}
              <span className="text-foreground font-semibold">Ashka Stephen</span>
            </span>
            <span>•</span>
            <a
              href="https://github.com/ashkastephen/inference-benchmark"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground-muted hover:text-foreground transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <span>•</span>
            <span>Data from live API calls</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
