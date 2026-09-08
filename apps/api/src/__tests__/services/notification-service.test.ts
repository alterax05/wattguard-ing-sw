import {
  describe,
  test,
  expect,
  beforeEach,
  mock,
} from "bun:test";

import { setupIntegrationTests } from "../helpers/db";
import { User } from "../../models/User";
import { SystemConfig } from "../../models/SystemConfig";
import type { AlertEmailPayload } from "../../email/mailer";
import {
  dispatchAlertNotifications,
} from "../../services/notification-service";

setupIntegrationTests();

type SentAlertEmail = {
  email: string;
  lang: string;
  event: string;
  payload: AlertEmailPayload;
};

let sendAlertEmailCalls: SentAlertEmail[] = [];
let sendAlertEmailImpl: (email: string) => Promise<void> = () =>
  Promise.resolve();

await mock.module("../../email/mailer", () => ({
  sendInviteEmail: mock(async () => Promise.resolve()),
  sendPasswordResetEmail: mock(async () => Promise.resolve()),
  sendEmail: mock(async () => Promise.resolve()),
  sendTestEmail: mock(async () => Promise.resolve()),
  sendAlertEmail: mock(
    async (
      email: string,
      lang: string,
      event: string,
      payload: AlertEmailPayload,
    ) => {
      await sendAlertEmailImpl(email);
      sendAlertEmailCalls.push({ email, lang, event, payload });
    },
  ),
}));

const PAYLOAD = {
  type: "threshold_exceeded",
  buildingName: "Test Building",
  sensorType: "internal_temp",
  location: "Sala Principale",
  value: 35,
  unit: "°C",
  limit: 30,
  severity: "medium" as const,
};

beforeEach(async () => {
  // The shared harness does not clean SystemConfig (a singleton); reset it so
  // the global email toggle starts at its default (true) in every test.
  await SystemConfig.deleteMany({});
  sendAlertEmailCalls = [];
  sendAlertEmailImpl = () => Promise.resolve();
});

describe("dispatchAlertNotifications", () => {
  test("emails every active user in their own language and skips disabled ones", async () => {
    await User.create([
      { email: "en@test.com", role: "admin", passwordHash: "x" },
      { email: "it@test.com", role: "operator", passwordHash: "x", language: "it" },
      { email: "off@test.com", role: "operator", passwordHash: "x", isDisabled: true },
    ]);

    await dispatchAlertNotifications("created", PAYLOAD);

    expect(sendAlertEmailCalls).toHaveLength(2);
    const byEmail = new Map(sendAlertEmailCalls.map((c) => [c.email, c]));
    expect(byEmail.get("en@test.com")!.lang).toBe("en");
    expect(byEmail.get("it@test.com")!.lang).toBe("it");
    for (const call of sendAlertEmailCalls) {
      expect(call.event).toBe("created");
      expect(call.payload.buildingName).toBe("Test Building");
      expect(call.payload.severity).toBe("medium");
    }
  });

  test("sends nothing when the global email toggle is off", async () => {
    await User.create({ email: "en@test.com", role: "admin", passwordHash: "x" });
    await SystemConfig.getOrCreate();
    await SystemConfig.findOneAndUpdate(
      {},
      { $set: { "notifications.emailEnabled": false } },
    );

    await dispatchAlertNotifications("created", PAYLOAD);

    expect(sendAlertEmailCalls).toHaveLength(0);
  });

  test("a failing recipient does not prevent the others from being emailed", async () => {
    await User.create([
      { email: "boom@test.com", role: "admin", passwordHash: "x" },
      { email: "ok@test.com", role: "operator", passwordHash: "x", language: "de" },
    ]);
    sendAlertEmailImpl = (email) =>
      email === "boom@test.com"
        ? Promise.reject(new Error("resend down"))
        : Promise.resolve();

    await dispatchAlertNotifications("resolved", {
      type: "efficiency_below_threshold",
      buildingName: "Test Building",
      value: 2.8,
      unit: "COP",
      limit: 2.5,
    });

    const emails = sendAlertEmailCalls.map((c) => c.email);
    expect(emails).toContain("ok@test.com");
    expect(emails).not.toContain("boom@test.com");
  });
});
