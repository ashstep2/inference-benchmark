"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { BenchmarkResult } from "@/lib/types";

interface BenchmarkContextType {
  results: BenchmarkResult[];
  lastRun: Date | null;
  setResults: (results: BenchmarkResult[]) => void;
}

const BenchmarkContext = createContext<BenchmarkContextType | undefined>(undefined);

const STORAGE_KEY = "benchmark_results";

interface StoredData {
  results: BenchmarkResult[];
  lastRun: string | null;
}

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [results, setResultsState] = useState<BenchmarkResult[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: StoredData = JSON.parse(stored);
        setResultsState(data.results);
        setLastRun(data.lastRun ? new Date(data.lastRun) : null);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const setResults = (newResults: BenchmarkResult[]) => {
    const now = new Date();
    setResultsState(newResults);
    setLastRun(now);

    // Persist to localStorage
    try {
      const data: StoredData = {
        results: newResults,
        lastRun: now.toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore localStorage errors
    }
  };

  return (
    <BenchmarkContext.Provider value={{ results, lastRun, setResults }}>
      {children}
    </BenchmarkContext.Provider>
  );
}

export function useBenchmark() {
  const context = useContext(BenchmarkContext);
  if (context === undefined) {
    throw new Error("useBenchmark must be used within a BenchmarkProvider");
  }
  return context;
}
