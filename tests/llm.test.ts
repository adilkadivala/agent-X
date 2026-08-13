import { describe, it, expect } from "vitest";
import { resolveLlmProvider, createLlmClient } from "../src/llm.js";

describe("resolveLlmProvider", () => {
  it("maps aliases", () => {
    expect(resolveLlmProvider("chatgpt")).toBe("openai");
    expect(resolveLlmProvider("claude")).toBe("anthropic");
    expect(resolveLlmProvider("xai")).toBe("grok");
    expect(resolveLlmProvider("openrouter")).toBe("openrouter");
    expect(resolveLlmProvider("ollama")).toBe("ollama");
  });
});

describe("createLlmClient", () => {
  it("requires base URL for custom", () => {
    expect(() =>
      createLlmClient({
        provider: "custom",
        apiKey: "k",
        model: "m",
      })
    ).toThrow(/LLM_BASE_URL/);
  });

  it("builds openai-compatible client without calling network", () => {
    const client = createLlmClient({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
    });
    expect(typeof client.complete).toBe("function");
  });

  it("builds anthropic client", () => {
    const client = createLlmClient({
      provider: "anthropic",
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-20250514",
    });
    expect(typeof client.complete).toBe("function");
  });
});
