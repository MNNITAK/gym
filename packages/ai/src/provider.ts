import type { z } from "zod";

// ── LLM provider interface ───────────────────────────────────────────────────
// Every engine calls this interface, never a vendor SDK directly. Swapping Groq
// for another provider means writing one new class, touching zero engine logic.

export type LlmTask = "reasoning" | "fast";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  task?: LlmTask;
  temperature?: number;
  maxTokens?: number;
  /** override the model resolved from task */
  model?: string;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CompleteResult {
  text: string;
  usage?: LlmUsage;
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  complete(
    messages: LlmMessage[],
    opts?: CompleteOptions,
  ): Promise<CompleteResult>;

  /**
   * Structured completion: the model must return JSON that parses against `schema`.
   * Retries once on a validation failure, feeding the error back to the model.
   * Generic is inferred from the schema's OUTPUT type to avoid zod input/output drift.
   */
  completeStructured<S extends z.ZodTypeAny>(
    messages: LlmMessage[],
    schema: S,
    opts?: CompleteOptions,
  ): Promise<{ data: z.output<S>; raw: CompleteResult }>;
}

export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}
