import { afterEach, describe, expect, it } from "vitest";
import { apiUrl } from "@/lib/apiUrl";

const ORIGINAL = process.env.NEXT_PUBLIC_KIRI_API_BASE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_KIRI_API_BASE;
  else process.env.NEXT_PUBLIC_KIRI_API_BASE = ORIGINAL;
});

describe("apiUrl", () => {
  it("returns the relative path when the base is unset", () => {
    delete process.env.NEXT_PUBLIC_KIRI_API_BASE;
    expect(apiUrl("/api/analyze")).toBe("/api/analyze");
  });

  it("treats an empty base as unset", () => {
    process.env.NEXT_PUBLIC_KIRI_API_BASE = "";
    expect(apiUrl("/api/chat")).toBe("/api/chat");
  });

  it("prefixes the base and strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_KIRI_API_BASE = "https://kiri.kugainc.com/";
    expect(apiUrl("/api/analyze")).toBe("https://kiri.kugainc.com/api/analyze");
    process.env.NEXT_PUBLIC_KIRI_API_BASE = "http://localhost:3000//";
    expect(apiUrl("/api/chat")).toBe("http://localhost:3000/api/chat");
  });

  it("adds a leading slash to the path when missing", () => {
    process.env.NEXT_PUBLIC_KIRI_API_BASE = "https://x.example";
    expect(apiUrl("api/analyze")).toBe("https://x.example/api/analyze");
  });
});
