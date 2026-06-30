import { describe, expect, it } from "vitest";
import { redactUntrustedText } from "../../src/eval/redact.js";

describe("redactUntrustedText", () => {
  it("redacts URL credentials", () => {
    expect(redactUntrustedText("clone https://user:secret@github.com/org/repo")).toContain(
      "https://<redacted>@",
    );
  });

  it("redacts token-like query parameters", () => {
    expect(redactUntrustedText("failed token=abc123&scope=repo")).toBe(
      "failed token=<redacted>&scope=repo",
    );
  });

  it("caps output length", () => {
    expect(redactUntrustedText("x".repeat(3000))).toHaveLength(2000);
  });
});
