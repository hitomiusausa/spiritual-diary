import { afterEach, describe, expect, it, vi } from "vitest";
import { chatRequestBody, createChatRequestSession, withChatAbort } from "../chatRequest";

afterEach(() => vi.useRealTimers());

describe("chat request cancellation boundary", () => {
  it("delete/close invalidates an old completion, and a new request cannot be cancelled by finishing the old one", () => {
    const session = createChatRequestSession();
    const old = session.begin();
    session.cancel();
    const current = session.begin();
    old.finish();
    expect(old.current()).toBe(false);
    expect(old.signal.aborted).toBe(true);
    expect(current.current()).toBe(true);
    expect(current.signal.aborted).toBe(false);
    session.cancel();
  });

  it("aborts a stalled ID lookup/body read even when the underlying promise ignores the signal", async () => {
    vi.useFakeTimers();
    const session = createChatRequestSession(100);
    const request = session.begin();
    const stalled = withChatAbort(new Promise(() => {}), request.signal);
    const assertion = expect(stalled).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    // A timeout is still the current operation so its failure can be shown; explicit delete cancels its generation.
    expect(request.current()).toBe(true);
    session.cancel();
    expect(request.current()).toBe(false);
  });
});

describe("outgoing chat minimization", () => {
  it("keeps the local 1000-message history untouched but sends only 12 role/content pairs and compact context", () => {
    const messages = Array.from({ length: 1000 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}`, internal: "not sent" }));
    const body = chatRequestBody({ messages, userProfile: { nickname: "audit", birthDate: "1990-01-01" }, entry: { event: "e", intuition: "i", secret: "no" }, result: { deepMessage: "d", innerMessage: "i", actionAdvice: "a", saju: { large: "no" } } });
    expect(messages).toHaveLength(1000);
    expect(body.messages).toHaveLength(12);
    expect(body.messages[0].content).toBe("m988");
    expect(body.messages[0]).toEqual({ role: "user", content: "m988" });
    expect(body.userProfile).toEqual({ nickname: "audit" });
    expect(body.context.entry).toEqual({ event: "e", intuition: "i" });
    expect(JSON.stringify(body)).not.toMatch(/internal|birthDate|secret|saju/);
  });

  it("does not send system notices or their support flags as ordinary conversation", () => {
    const body = chatRequestBody({ messages: [{ role: "assistant", content: "failed", isSystem: true }, { role: "system", content: "no" }, { role: "user", content: "hello", support: true }] });
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
  });
});
