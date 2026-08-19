import { describe, test, expect, beforeAll } from "bun:test";
import { ensureI18nReady, getTranslator } from "../../lib/i18n";

describe("lib/i18n", () => {
  beforeAll(async () => {
    await ensureI18nReady();
  });

  test("translates a key for a supported language", () => {
    const t = getTranslator("it");
    expect(t("emails.invite.subject")).toBe("Invito a WattGuard");
  });

  test("interpolates variables into email templates", () => {
    const t = getTranslator("en");
    expect(t("emails.invite.subject", { role: "admin" })).toBe(
      "Invitation to WattGuard",
    );

    const text = t("emails.invite.text", {
      role: "operator",
      inviteUrl: "https://wattguard.local/accept?token=abc123",
    });
    expect(text).toContain("operator");
    expect(text).toContain("https://wattguard.local/accept?token=abc123");
  });

  test("interpolates multiple variables and preserves HTML in email bodies", () => {
    const t = getTranslator("it");
    const body = t("emails.invite.htmlBody", { role: "admin" });
    expect(body).toContain("<strong>admin</strong>");
  });

  test("falls back to English for a language that is not supported", () => {
    const t = getTranslator("fr" as "en" | "it" | "de");
    expect(t("emails.invite.subject")).toBe("Invitation to WattGuard");
  });
});