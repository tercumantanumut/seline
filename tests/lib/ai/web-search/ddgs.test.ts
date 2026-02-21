import { beforeEach, describe, expect, it } from "vitest";
import { getDDGSClientOptionsFromEnv } from "@/lib/ai/web-search/ddgs";

describe("DDGS env options", () => {
  beforeEach(() => {
    delete process.env.DDG_VERIFY_TLS;
    delete process.env.DDG_TIMEOUT_MS;
    delete process.env.DDG_PROXY;
  });

  it("returns empty options when env is not set", () => {
    expect(getDDGSClientOptionsFromEnv()).toEqual({});
  });

  it("parses tls verify flag, timeout, and proxy", () => {
    process.env.DDG_VERIFY_TLS = "false";
    process.env.DDG_TIMEOUT_MS = "20000";
    process.env.DDG_PROXY = "http://127.0.0.1:8080";

    expect(getDDGSClientOptionsFromEnv()).toEqual({
      verify: false,
      timeout: 20000,
      proxy: "http://127.0.0.1:8080",
    });
  });

  it("ignores invalid timeout values", () => {
    process.env.DDG_TIMEOUT_MS = "abc";

    expect(getDDGSClientOptionsFromEnv()).toEqual({});
  });
});
