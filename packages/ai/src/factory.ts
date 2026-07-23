import type { LlmProvider } from "./provider.js";
import { GroqProvider } from "./groq-provider.js";
import { MockProvider } from "./mock-provider.js";

export interface LlmEnv {
  LLM_PROVIDER?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL_REASONING?: string;
  GROQ_MODEL_FAST?: string;
}

/**
 * Resolve the active provider from env. Defaults to Groq; falls back to the
 * deterministic MockProvider when no key is present so the app still boots locally.
 */
export function createLlmProvider(
  env: LlmEnv = process.env as LlmEnv,
): LlmProvider {
  const which = (env.LLM_PROVIDER ?? "groq").toLowerCase();

  if (which === "mock") return new MockProvider();

  if (which === "groq") {
    if (!env.GROQ_API_KEY) {
      // eslint-disable-next-line no-console
      console.warn(
        "[@keystone/ai] GROQ_API_KEY not set — using MockProvider. Set it for real generations.",
      );
      return new MockProvider();
    }
    return new GroqProvider({
      apiKey: env.GROQ_API_KEY,
      reasoningModel: env.GROQ_MODEL_REASONING,
      fastModel: env.GROQ_MODEL_FAST,
    });
  }

  throw new Error(`Unknown LLM_PROVIDER: ${which}`);
}
