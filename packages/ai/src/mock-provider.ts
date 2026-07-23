import type { z } from "zod";
import type {
  CompleteOptions,
  CompleteResult,
  LlmMessage,
  LlmProvider,
} from "./provider.js";

/**
 * Deterministic provider for local dev and tests — no API key, no network.
 * You register canned structured responses keyed by a substring of the prompt.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  private canned: Array<{ match: RegExp; value: unknown }> = [];

  when(match: RegExp, value: unknown): this {
    this.canned.push({ match, value });
    return this;
  }

  async complete(
    messages: LlmMessage[],
    _opts?: CompleteOptions,
  ): Promise<CompleteResult> {
    return {
      text: `[[mock reply to: ${messages.at(-1)?.content?.slice(0, 60) ?? ""}]]`,
      model: "mock",
    };
  }

  async completeStructured<S extends z.ZodTypeAny>(
    messages: LlmMessage[],
    schema: S,
    _opts?: CompleteOptions,
  ): Promise<{ data: z.output<S>; raw: CompleteResult }> {
    const joined = messages.map((m) => m.content).join("\n");
    const hit = this.canned.find((c) => c.match.test(joined));
    const value = hit ? hit.value : {};
    const parsed = schema.parse(value);
    return {
      data: parsed,
      raw: { text: JSON.stringify(value), model: "mock" },
    };
  }
}
