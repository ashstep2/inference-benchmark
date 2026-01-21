export interface ProviderConfig {
  name: string;
  model: string;
  color: string;
  endpoint: string;
}

export const providers: Record<string, ProviderConfig> = {
  cerebras: {
    name: "Cerebras",
    model: "llama-3.3-70b",
    color: "#10B981",
    endpoint: "cerebras-sdk",
  },
  fireworks: {
    name: "Fireworks",
    model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    color: "#F59E0B",
    endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
  },
  groq: {
    name: "Groq",
    model: "llama-3.3-70b-versatile",
    color: "#EC4899",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
  },
};
