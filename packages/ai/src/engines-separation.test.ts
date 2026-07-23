// The three engines are separate PRODUCTS, not three prompts. These tests prove
// the separation is enforced at runtime rather than trusted to the model.
import { describe, it, expect } from "vitest";
import { MockProvider } from "./mock-provider.js";
import { runEngineAgent, agentFor, AGENTS } from "./agents/registry.js";
import { ENGINES, ENGINE_IDS, resolveEngineId, engineAllows } from "@keystone/core";

const ctx = {
  name: "Aarav",
  goal: "lose fat",
  tier: "GOLD",
  currentStreak: 12,
  memories: [],
  injuries: [],
};

describe("engine identity", () => {
  it("has exactly three named engines", () => {
    expect(ENGINE_IDS).toEqual(["hearth", "forge", "anchor"]);
    expect(ENGINES.hearth.name).toBe("Hearth");
    expect(ENGINES.forge.name).toBe("Forge");
    expect(ENGINES.anchor.name).toBe("Anchor");
  });

  it("every engine has its own persona and openers", () => {
    const personas = ENGINE_IDS.map((id) => AGENTS[id].persona);
    expect(new Set(personas).size).toBe(3);
    for (const id of ENGINE_IDS) {
      expect(AGENTS[id].openers(ctx).length).toBeGreaterThan(0);
    }
  });

  it("resolves legacy ids so existing threads survive the rename", () => {
    expect(resolveEngineId("diet")).toBe("hearth");
    expect(resolveEngineId("training")).toBe("forge");
    expect(resolveEngineId("general")).toBe("anchor");
    expect(resolveEngineId("hearth")).toBe("hearth");
    expect(resolveEngineId(undefined)).toBe("anchor");
  });
});

describe("capability isolation", () => {
  it("only Forge may flag an injury", () => {
    expect(engineAllows("forge", "flag_injury")).toBe(true);
    expect(engineAllows("hearth", "flag_injury")).toBe(false);
    expect(engineAllows("anchor", "flag_injury")).toBe(false);
  });

  it("only Hearth may log food or a craving", () => {
    expect(engineAllows("hearth", "log_food")).toBe(true);
    expect(engineAllows("forge", "log_food")).toBe(false);
    expect(engineAllows("hearth", "log_craving")).toBe(true);
    expect(engineAllows("anchor", "log_craving")).toBe(false);
  });

  it("only Forge may log a workout", () => {
    expect(engineAllows("forge", "log_workout")).toBe(true);
    expect(engineAllows("hearth", "log_workout")).toBe(false);
  });

  it("every engine can always escalate to a human", () => {
    for (const id of ENGINE_IDS) expect(engineAllows(id, "ask_coach")).toBe(true);
  });

  it("DROPS an out-of-scope action even when the model returns one", async () => {
    // Hearth is told to flag an injury — it must not be able to.
    const llm = new MockProvider().when(/HEARTH/, {
      reply: "ok",
      actions: [
        { type: "flag_injury", payload: { region: "knee", detail: "hurts" }, label: "Flagged" },
        { type: "log_food", payload: { description: "dal" }, label: "Logged dal" },
      ],
      suggestions: [],
      escalate: false,
    });
    const res = await runEngineAgent(llm, { engine: "hearth", message: "my knee hurts", context: ctx });
    expect(res.actions.map((a) => a.type)).toEqual(["log_food"]);
  });
});

describe("prompt scoping", () => {
  it("an engine is never told about actions it cannot perform", () => {
    // Capture the system prompt Hearth would send.
    let captured = "";
    const llm = new MockProvider().when(/HEARTH/, {
      reply: "ok", actions: [], suggestions: [], escalate: false,
    });
    const original = llm.completeStructured.bind(llm);
    llm.completeStructured = async (messages, schema, opts) => {
      captured = messages.map((m) => m.content).join("\n");
      return original(messages, schema, opts);
    };
    return runEngineAgent(llm, { engine: "hearth", message: "hi", context: ctx }).then(() => {
      expect(captured).toContain("HEARTH");
      expect(captured).toContain("log_food");
      // Forge-only capability must be absent from Hearth's prompt entirely.
      expect(captured).not.toContain("flag_injury");
    });
  });

  it("each engine names its siblings for hand-offs", () => {
    expect(ENGINES.hearth.handsOff.map((h) => h.to)).toContain("forge");
    expect(ENGINES.forge.handsOff.map((h) => h.to)).toContain("hearth");
    expect(ENGINES.anchor.handsOff.map((h) => h.to)).toEqual(
      expect.arrayContaining(["hearth", "forge"]),
    );
  });
});

describe("safety is engine-independent", () => {
  it("every engine hard-escalates medical language before the model", async () => {
    for (const id of ENGINE_IDS) {
      const res = await runEngineAgent(new MockProvider(), {
        engine: id,
        message: "I have chest pain during squats",
        context: ctx,
      });
      expect(res.escalate).toBe(true);
      expect(res.escalateReason).toContain("safety");
      expect(res.engine).toBe(id);
    }
  });
});

describe("agentFor", () => {
  it("maps ids and legacy aliases to the right definition", () => {
    expect(agentFor("hearth").engine).toBe("hearth");
    expect(agentFor("diet").engine).toBe("hearth");
    expect(agentFor("training").engine).toBe("forge");
  });
});
