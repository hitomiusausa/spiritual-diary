import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedJson, fetchUpstreamJson } from "@/lib/apiRequest";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function request(body, headers = {}) {
  return new Request("http://audit.invalid/", { method: "POST", headers, body });
}

describe("bounded JSON request bodies", () => {
  it("counts UTF-8 bytes, accepts the exact limit, and rejects a false or missing length", async () => {
    const text = JSON.stringify({ text: "あ" });
    const bytes = new TextEncoder().encode(text).length;
    await expect(readBoundedJson(request(text), bytes)).resolves.toEqual({ text: "あ" });
    await expect(readBoundedJson(request(text), bytes - 1)).rejects.toMatchObject({ code: "body_too_large", status: 413 });
    await expect(readBoundedJson(request(text, { "content-length": "1" }), bytes - 1)).rejects.toMatchObject({ code: "body_too_large" });
  });

  it("stops before reading a declared oversize body and does not expose invalid JSON", async () => {
    await expect(readBoundedJson(request("{}", { "content-length": "1000" }), 10)).rejects.toMatchObject({ status: 413 });
    const error = await readBoundedJson(request("PRIVATE_DIARY_MARKER"), 100).catch((e) => e);
    expect(error).toMatchObject({ message: "invalid_json", status: 400 });
    expect(String(error)).not.toContain("PRIVATE_DIARY_MARKER");
  });
});

describe("upstream deadline", () => {
  it("bounds a fetch that never resolves and aborts it", async () => {
    vi.useFakeTimers();
    let signal;
    vi.stubGlobal("fetch", vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}); }));
    const pending = fetchUpstreamJson("https://audit.invalid", {}, 100);
    const checked = expect(pending).rejects.toMatchObject({ code: "upstream_timeout", status: 504 });
    await vi.advanceTimersByTimeAsync(100);
    await checked;
    expect(signal.aborted).toBe(true);
  });

  it("keeps the deadline active while the response body stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    const pending = fetchUpstreamJson("https://audit.invalid", {}, 100);
    const checked = expect(pending).rejects.toMatchObject({ code: "upstream_timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await checked;
  });

  it("replaces upstream parsing or network errors with fixed classifications", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PRIVATE_UPSTREAM_MARKER")));
    await expect(fetchUpstreamJson("https://audit.invalid", {}, 100)).rejects.toMatchObject({ message: "upstream_invalid_json", status: 502 });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("PRIVATE_NETWORK_MARKER"); }));
    const error = await fetchUpstreamJson("https://audit.invalid", {}, 100).catch((e) => e);
    expect(error.message).toBe("upstream_unavailable");
    expect(String(error)).not.toContain("PRIVATE_NETWORK_MARKER");
  });
});

describe("non-2xx diagnostics preserve status without returning raw error data", () => {
  it("returns a fixed reason and null data for a recognized provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { type: "invalid_request_error", message: "You have reached your specified workspace API usage limits. PRIVATE_UPSTREAM_MARKER" },
    }), { status: 400 })));
    const result = await fetchUpstreamJson("https://audit.invalid", {}, 100);
    expect(result.response.status).toBe(400);
    expect(result.data).toBeNull();
    expect(result.upstreamFailure).toBe("provider_spend_limit");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_UPSTREAM_MARKER");
  });

  it.each([
    [400, "PRIVATE_NOT_JSON", {}, "provider_request_invalid"],
    [503, "PRIVATE_NOT_JSON", {}, "provider_server_error"],
    [429, " ".repeat(17 * 1024), {}, "provider_rate_limit"],
    [429, " ".repeat(17 * 1024), { "content-length": "1" }, "provider_rate_limit"],
    [402, "{}", { "content-length": String(17 * 1024) }, "provider_billing"],
    [418, "{}", {}, "provider_unknown"],
  ])("keeps status %s if diagnostic JSON is malformed, oversized, or unknown", async (status, body, headers, reason) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers })));
    const result = await fetchUpstreamJson("https://audit.invalid", {}, 100);
    expect(result.response.status).toBe(status);
    expect(result.data).toBeNull();
    expect(result.upstreamFailure).toBe(reason);
  });

  it("keeps a received status when the outer deadline rejects before the error body completes", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"error":{"message":"PRIVATE_PARTIAL')); },
      cancel,
    });
    let signal;
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      signal = options.signal;
      return new Response(body, { status: 429 });
    }));
    const pending = fetchUpstreamJson("https://audit.invalid", {}, 100);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.response.status).toBe(429);
    expect(result.upstreamFailure).toBe("provider_rate_limit");
    expect(result.data).toBeNull();
    expect(signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PARTIAL");
    expect(vi.getTimerCount()).toBe(0);
  });
});
