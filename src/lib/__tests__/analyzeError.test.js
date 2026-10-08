import { describe, expect, it } from "vitest";
import { describeAnalyzeFailure } from "@/lib/analyzeError";

const RAW_SERVER_STRINGS = [
  "Daily limit reached",
  "Too many requests",
  "CLAUDE_API_KEY is not set",
  "Service unavailable",
  "Load failed",
];

function shown(failure) {
  return `${failure.title} ${failure.message}`;
}

describe("describeAnalyzeFailure", () => {
  it("speaks in Kiri's voice when the network is unreachable (offline, CORS refusal)", () => {
    const failure = describeAnalyzeFailure({ network: true });
    expect(failure.title).toMatch(/届きませんでした/);
    expect(failure.message).toMatch(/記録はそのまま/);
  });

  it("tells the user the daily limit is reached and when to come back", () => {
    const failure = describeAnalyzeFailure({ status: 429, code: "daily_limit" });
    expect(shown(failure)).toMatch(/今日/);
    expect(shown(failure)).toMatch(/明日/);
  });

  it("asks to wait a moment on the short-term rate limit", () => {
    const failure = describeAnalyzeFailure({ status: 429, code: "rate_limited" });
    expect(shown(failure)).toMatch(/少し/);
    expect(shown(failure)).not.toMatch(/明日/);
  });

  it("points at the entry on invalid input", () => {
    expect(shown(describeAnalyzeFailure({ status: 400 }))).toMatch(/出来事/);
  });

  it("falls back to a gentle retry message on server errors and unparsable responses", () => {
    for (const input of [{ status: 500 }, { status: 502 }, { status: 503 }, { status: 200 }, {}]) {
      const failure = describeAnalyzeFailure(input);
      expect(failure.title).toBeTruthy();
      expect(failure.message).toMatch(/もう一度/);
    }
  });

  it("never shows raw server or browser strings and carries no technical details", () => {
    const inputs = [
      { network: true },
      { status: 429, code: "daily_limit" },
      { status: 429, code: "rate_limited" },
      { status: 400 },
      { status: 500 },
    ];
    for (const input of inputs) {
      const failure = describeAnalyzeFailure(input);
      for (const raw of RAW_SERVER_STRINGS) expect(shown(failure)).not.toContain(raw);
      expect(failure.details).toBeUndefined();
    }
  });
});
