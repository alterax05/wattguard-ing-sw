import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { languageDetector } from "hono/language";

function makeApp() {
  return new Hono()
    .use(
      languageDetector({
        supportedLanguages: ["en", "it", "de"],
        fallbackLanguage: "en",
      }),
    )
    .get("/", (c) => c.text(c.get("language")));
}

describe("language detector middleware", () => {
  test("detects the language from the Accept-Language header", async () => {
    const app = makeApp();
    const res = await app.request("/", {
      headers: { "accept-language": "it" },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("it");
  });

  test("falls back to English for unsupported languages", async () => {
    const app = makeApp();
    const res = await app.request("/", {
      headers: { "accept-language": "zh-CN" },
    });

    expect(await res.text()).toBe("en");
  });

  test("falls back to English when no Accept-Language header is present", async () => {
    const app = makeApp();
    const res = await app.request("/");

    expect(await res.text()).toBe("en");
  });
});