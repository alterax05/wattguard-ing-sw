import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import mqtt from "mqtt";
import { SensorNotFoundError } from "../../services/reading-service";
import type { IngestReadingInput } from "../../services/reading-service";

const ingestReadingMock = mock<(input: IngestReadingInput) => Promise<void>>();

await mock.module("../../services/reading-service", () => ({
  ingestReading: ingestReadingMock,
  SensorNotFoundError,
}));

const { connectAndSubscribe } = await import("../../lib/mqtt");

// Mock MQTT Client
type MqttEventCallback = (...args: unknown[]) => void;
const mockOn = mock<(event: string, cb: MqttEventCallback) => void>();
const mockSubscribe = mock<(...args: never[]) => void>();
const mockMqttClient = {
  on: mockOn,
  subscribe: mockSubscribe,
};

const VALID_SENSOR_ID = "507f1f77bcf86cd799439011";

function getMessageHandler() {
  const handler = mockOn.mock.calls.find((call) => call[0] === "message")?.[1];
  expect(handler).toBeDefined();
  // SAFETY: connectAndSubscribe registers exactly one "message" listener whose handler is async and receives (topic, payload).
  return handler as (topic: string, message: Buffer) => Promise<void>;
}

describe("lib/mqtt", () => {
  let _connectCallback: () => void;
  let warnSpy: ReturnType<typeof spyOn<typeof console, "warn">>;

  beforeEach(() => {
    ingestReadingMock.mockReset();
    ingestReadingMock.mockImplementation(() => Promise.resolve());
    mockOn.mockReset();
    mockSubscribe.mockReset();

    // Silence expected validation warnings; individual tests may assert on them
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    // Setup basic mock behavior
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "connect") _connectCallback = cb;
      return mockMqttClient;
    });

    // Mock connectAsync (connectAndSubscribe awaits it). The mqtt package
    // exposes connectAsync as a read-only getter, so override it with a
    // writable value property on the shared module object.
    Object.defineProperty(mqtt, "connectAsync", {
      value: mock(() => Promise.resolve(mockMqttClient)),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("delegates valid messages to the reading service", async () => {
    await connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(
        JSON.stringify({
          value: 22.5,
          unit: "°C",
          timestamp: "2023-01-01T12:00:00Z",
        }),
      ),
    );

    expect(ingestReadingMock).toHaveBeenCalledTimes(1);
    expect(ingestReadingMock).toHaveBeenCalledWith({
      sensorId: VALID_SENSOR_ID,
      value: 22.5,
      unit: "°C",
      timestamp: new Date("2023-01-01T12:00:00Z"),
    });
  });


  test("ignores invalid topics", async () => {
    await connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler("wrong/topic", Buffer.from("{}"));
    await messageHandler("sensors/foo/bar/readings", Buffer.from("{}"));
    await messageHandler(`sensors/${VALID_SENSOR_ID}/events`, Buffer.from("{}"));

    expect(ingestReadingMock).not.toHaveBeenCalled();
  });

  test("ignores malformed JSON payloads", async () => {
    await connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from("{not json"),
    );

    expect(ingestReadingMock).not.toHaveBeenCalled();
  });

  test("ignores payloads failing validation", async () => {
    await connectAndSubscribe();
    const messageHandler = getMessageHandler();

    // value is not a number
    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: "22.5", unit: "°C" })),
    );
    // unit is empty
    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: 22.5, unit: "" })),
    );
    // unit is missing
    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: 22.5 })),
    );
    // timestamp is not a valid ISO datetime
    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: 22.5, unit: "°C", timestamp: "yesterday" })),
    );

    expect(ingestReadingMock).not.toHaveBeenCalled();
  });
});
