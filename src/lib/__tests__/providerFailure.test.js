import { describe, expect, it } from "vitest";
import { classifyProviderFailure } from "@/lib/providerFailure";

describe("provider failure classifications contain only fixed reasons", () => {
  it.each([
    [400, "provider_request_invalid"], [401, "provider_auth"], [402, "provider_billing"],
    [403, "provider_permission"], [404, "provider_not_found"], [413, "provider_request_too_large"],
    [429, "provider_rate_limit"], [529, "provider_overloaded"], [500, "provider_server_error"],
    [503, "provider_server_error"], [418, "provider_unknown"],
  ])("keeps status %s meaningful when upstream JSON is absent or unknown", (status, reason) => {
    expect(classifyProviderFailure(status)).toBe(reason);
    expect(classifyProviderFailure(status, { error: { type: "PRIVATE_TYPE", message: "PRIVATE_MESSAGE" } })).toBe(reason);
  });

  it.each([
    "You have reached your specified API usage limits. PRIVATE_ORG_DETAIL",
    "You have reached your specified workspace API usage limits: PRIVATE_WORKSPACE_DETAIL",
  ])("recognizes only the known spend-limit message without returning its details", (message) => {
    expect(classifyProviderFailure(400, { error: { type: "invalid_request_error", message } })).toBe("provider_spend_limit");
  });

  it.each([
    { type: "invalid_request_error", message: "PRIVATE_MESSAGE about credit, billing or spend limit" },
    { type: "PRIVATE_TYPE", message: "You have reached your specified API usage limits." },
    { type: "invalid_request_error", message: "You have reached your specified API usage limitsOfAnotherKind" },
    { type: "invalid_request_error", message: { private: "PRIVATE_MESSAGE" } },
  ])("does not infer billing or spend from arbitrary/near-match error contents", (error) => {
    expect(classifyProviderFailure(400, { error })).toBe("provider_request_invalid");
  });

  it("uses the exact documented tier-cap code and status, never arbitrary details", () => {
    const data = { error: { type: "rate_limit_error", details: { error_code: "enforced_spend_limit_reached", private: "PRIVATE_DETAIL" } } };
    expect(classifyProviderFailure(429, data)).toBe("provider_tier_spend_limit");
    expect(classifyProviderFailure(400, data)).toBe("provider_request_invalid");
    data.error.details.error_code = "PRIVATE_DETAIL";
    expect(classifyProviderFailure(429, data)).toBe("provider_rate_limit");
  });
});
