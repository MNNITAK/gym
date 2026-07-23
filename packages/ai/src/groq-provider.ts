import OpenAI from "openai";
import type { z } from "zod";
import {
  LlmValidationError,
  type CompleteOptions,
  type CompleteResult,
  type LlmMessage,
  type LlmProvider,
} from "./provider.js";

// Groq exposes an OpenAI-compatible endpoint; we reuse the OpenAI SDK pointed at it.
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export interface GroqConfig {
  apiKey: string;
  reasoningModel?: string;
  fastModel?: string;
}

export class GroqProvider implements LlmProvider {
  readonly name = "groq";
  private client: OpenAI;
  private reasoningModel: string;
  private fastModel: string;

  constructor(cfg: GroqConfig) {
    this.client = new OpenAI({ apiKey: cfg.apiKey, baseURL: GROQ_BASE_URL });
    this.reasoningModel = cfg.reasoningModel ?? "llama-3.3-70b-versatile";
    this.fastModel = cfg.fastModel ?? "llama-3.1-8b-instant";
  }

  private resolveModel(opts?: CompleteOptions): string {
    if (opts?.model) return opts.model;
    return opts?.task === "fast" ? this.fastModel : this.reasoningModel;
  }

  async complete(
    messages: LlmMessage[],
    opts?: CompleteOptions,
  ): Promise<CompleteResult> {
    const model = this.resolveModel(opts);
    const res = await this.client.chat.completions.create({
      model,
      messages,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 2048,
    });
    const choice = res.choices[0];
    return {
      text: choice?.message?.content ?? "",
      model,
      usage: res.usage
        ? {
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async completeStructured<S extends z.ZodTypeAny>(
    messages: LlmMessage[],
    schema: S,
    opts?: CompleteOptions,
  ): Promise<{ data: z.output<S>; raw: CompleteResult }> {
    const model = this.resolveModel(opts);
    const jsonMessages: LlmMessage[] = [
      {
        role: "system",
        content:
          "You are a structured data generator. Respond with a single valid JSON object only — no prose, no markdown fences.",
      },
      ...messages,
    ];

    const attempt = async (extra?: LlmMessage): Promise<CompleteResult> => {
      const res = await this.client.chat.completions.create({
        model,
        messages: extra ? [...jsonMessages, extra] : jsonMessages,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 2048,
        response_format: { type: "json_object" },
      });
      const choice = res.choices[0];
      return {
        text: choice?.message?.content ?? "",
        model,
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens,
              completionTokens: res.usage.completion_tokens,
            }
          : undefined,
      };
    };

    let raw = await attempt();
    let parsed = safeParse(schema, raw.text);
    if (parsed.ok) return { data: parsed.data, raw };

    // One repair attempt, feeding the validation error back to the model.
    raw = await attempt({
      role: "user",
      content: `Your previous JSON was invalid: ${parsed.error}. Return corrected JSON that satisfies the schema.`,
    });
    parsed = safeParse(schema, raw.text);
    if (parsed.ok) return { data: parsed.data, raw };

    throw new LlmValidationError(
      `Structured output failed schema validation: ${parsed.error}`,
      raw.text,
    );
  }
}

function safeParse<S extends z.ZodTypeAny>(
  schema: S,
  text: string,
): { ok: true; data: z.output<S> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(text));
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  const res = schema.safeParse(json);
  if (res.success) return { ok: true, data: res.data };
  return { ok: false, error: res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/,"")
    .trim();
}
