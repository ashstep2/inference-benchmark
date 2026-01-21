import { NextRequest } from "next/server";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { providers } from "@/lib/providers";
import { AGENT_RACE_CONFIG } from "@/lib/config";
import { getRequiredApiKey, createApiError } from "@/lib/benchmark-utils";

type Provider = "cerebras" | "groq" | "fireworks";

const STEPS = [
  {
    name: "Research",
    prompt: (company: string) =>
      `Find 3 key facts about ${company}'s business model, products, and recent news.`,
  },
  {
    name: "Summarize",
    prompt: (prev: string) =>
      `Summarize this research into exactly 3 concise bullet points:\n\n${prev}`,
  },
  {
    name: "Draft",
    prompt: (prev: string) =>
      `Write a 3-paragraph cold outreach email based on:\n\n${prev}`,
  },
  {
    name: "Critique",
    prompt: (prev: string) =>
      `Critique this email. List 3 specific improvements:\n\n${prev}`,
  },
  {
    name: "Revise",
    prompt: (prev: string) =>
      `Revise the email with these improvements:\n\n${prev}`,
  },
];

async function callProvider(
  provider: Provider,
  prompt: string,
  maxTokens: number
): Promise<{ content: string }> {
  if (provider === "cerebras") {
    const apiKey = getRequiredApiKey("CEREBRAS_API_KEY");
    const client = new Cerebras({ apiKey });
    const providerConfig = providers.cerebras;

    const response = await client.chat.completions.create({
      model: providerConfig.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    });

    // Cerebras SDK types don't properly type the response
    const choices = response.choices as Array<{ message?: { content?: string } }>;
    const content = choices?.[0]?.message?.content || "";
    return { content };
  }

  // Groq and Fireworks use OpenAI-compatible API
  const apiKeyEnv = provider === "fireworks" ? "FIREWORKS_API_KEY" : "GROQ_API_KEY";
  const apiKey = getRequiredApiKey(apiKeyEnv);
  const providerConfig = providers[provider];

  const response = await fetch(providerConfig.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createApiError(provider, response.status, errorText);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return { content };
}

function sendSSEMessage(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: Record<string, unknown>
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: NextRequest) {
  try {
    const { provider, company } = await request.json();

    if (!provider || !["cerebras", "groq", "fireworks"].includes(provider)) {
      return new Response(
        JSON.stringify({ error: "Invalid provider. Must be cerebras, groq, or fireworks" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!company || typeof company !== "string") {
      return new Response(
        JSON.stringify({ error: "company is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let previousOutput = company;
        let totalLatency = 0;
        let hasError = false;

        try {
          for (let i = 0; i < STEPS.length; i++) {
            const step = STEPS[i];

            // Send "running" status
            sendSSEMessage(controller, encoder, {
              step: i + 1,
              name: step.name,
              status: "running",
            });

            const startTime = performance.now();

            try {
              const prompt = i === 0 ? step.prompt(company) : step.prompt(previousOutput);
              const response = await callProvider(
                provider as Provider,
                prompt,
                AGENT_RACE_CONFIG.MAX_TOKENS_PER_STEP
              );

              const latency = Math.round(performance.now() - startTime);
              totalLatency += latency;
              previousOutput = response.content;

              // Send "complete" status
              sendSSEMessage(controller, encoder, {
                step: i + 1,
                name: step.name,
                status: "complete",
                latency_ms: latency,
                output_preview:
                  response.content.length > AGENT_RACE_CONFIG.OUTPUT_PREVIEW_LENGTH
                    ? response.content.slice(0, AGENT_RACE_CONFIG.OUTPUT_PREVIEW_LENGTH) + "..."
                    : response.content,
              });
            } catch (error) {
              hasError = true;
              sendSSEMessage(controller, encoder, {
                step: i + 1,
                name: step.name,
                status: "error",
                error: error instanceof Error ? error.message : String(error),
              });
              break;
            }
          }

          // Send completion (always send, even on error, so client knows stream ended)
          sendSSEMessage(controller, encoder, {
            complete: true,
            total_latency_ms: totalLatency,
            has_error: hasError,
          });
        } finally {
          // Ensure controller is always closed
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
