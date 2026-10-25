import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiUrl, requestJson } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API helpers", () => {
  it("builds query strings and omits empty values", () => {
    const url = new URL(
      apiUrl("/api/v1/overview", {
        service: "primary_care",
        threshold_minutes: 30,
        empty: null,
        flag: false,
      }),
    );
    expect(url.pathname).toBe("/api/v1/overview");
    expect(url.searchParams.get("service")).toBe("primary_care");
    expect(url.searchParams.get("threshold_minutes")).toBe("30");
    expect(url.searchParams.has("empty")).toBe(false);
    expect(url.searchParams.get("flag")).toBe("false");
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(requestJson<{ status: string }>("http://example.test/health")).resolves.toEqual({
      status: "ok",
    });
  });

  it("turns server errors into ApiError with the server detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Unknown service" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(requestJson("http://example.test/api")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      detail: "Unknown service",
    });
  });

  it("explains network failures without exposing internals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    const failure = requestJson("http://example.test/api");
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toThrow(/could not reach the analysis API/i);
  });
});
