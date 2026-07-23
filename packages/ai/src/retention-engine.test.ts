import { describe, it, expect } from "vitest";
import { MockProvider } from "./mock-provider.js";
import {
  extractMemories,
  answerConcierge,
  draftWinMessage,
} from "./engines/retention.js";

describe("memory extraction", () => {
  it("returns structured durable facts", async () => {
    const llm = new MockProvider().when(/extract durable facts/i, {
      memories: [{ kind: "INJURY", key: "injury.knee", value: "left knee pain on squats", confidence: 0.8 }],
    });
    const res = await extractMemories(llm, "my left knee has been hurting on squats");
    expect(res.memories[0]!.kind).toBe("INJURY");
  });

  it("returns an empty extraction on model failure (never blocks)", async () => {
    const res = await extractMemories(new MockProvider(), "hi"); // no canned → parses {} → memories:[]
    expect(res.memories).toEqual([]);
  });
});

describe("concierge", () => {
  it("hard-escalates a medical question before the model", async () => {
    const res = await answerConcierge(new MockProvider(), {
      question: "I have chest pain, should I still train?",
      memberName: "A",
      memories: [],
    });
    expect(res.needsEscalation).toBe(true);
    expect(res.escalationReason).toContain("safety");
  });

  it("answers a routine question via the model", async () => {
    const llm = new MockProvider().when(/24\/7 concierge/i, {
      answer: "Your next class is at 6pm.",
      language: "en",
      needsEscalation: false,
    });
    const res = await answerConcierge(llm, {
      question: "when is my class?",
      memberName: "A",
      memories: [],
    });
    expect(res.needsEscalation).toBe(false);
    expect(res.answer).toContain("6pm");
  });
});

describe("send a win", () => {
  it("falls back to a deterministic congrats with no model", async () => {
    const msg = await draftWinMessage(new MockProvider(), {
      memberName: "Aarav",
      milestoneTitle: "2kg down",
    });
    expect(msg).toContain("Aarav");
    expect(msg).toContain("2kg down");
  });
});
