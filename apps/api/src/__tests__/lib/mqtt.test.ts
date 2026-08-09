import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import mqtt from "mqtt";
import { SensorNotFoundError } from "../../services/reading-service";
import type { IngestReadingInput } from "../../services/reading-service";

const ingestReadingMock = mock<(input: IngestReadingInput) => Promise<void>>();

mock.module("../../services/reading-service", () => ({
  ingestReading: ingestReadingMock,
  SensorNotFoundError,
}));

const { connectAndSubscribe } = await import("../../lib/mqtt");

// Mock MQTT Client
const mockOn = mock();
const mockSubscribe = mock();
const mockMqttClient = {
  on: mockOn,
  subscribe: mockSubscribe,
};

const VALID_SENSOR_ID = "507f1f77bcf86cd799439011";

function getMessageHandler() {
  const handler = mockOn.mock.calls.find((call) => call[0] === "message")?.[1];
  expect(handler).toBeDefined();
  return handler as (topic: string, message: Buffer) => Promise<void>;
}

describe("MQTT Service", () => {
  let connectCallback: () => void;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    ingestReadingMock.mockReset();
    ingestReadingMock.mockImplementation(() => Promise.resolve());
    mockOn.mockReset();
    mockSubscribe.mockReset();

    // Silence expected validation warnings; individual tests may assert on them
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    // Setup basic mock behavior
    mockOn.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "connect") connectCallback = cb;
      return mockMqttClient;
    });

    // Mock the connect function
    // @ts-expect-error assigning a mock to the typed connect function
    mqtt.connect = mock(() => mockMqttClient);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("should connect and subscribe on initialization", () => {
    connectAndSubscribe();

    expect(mqtt.connect).toHaveBeenCalled();

    // Trigger connect event
    connectCallback();

    expect(mockSubscribe).toHaveBeenCalledWith(
      "sensors/+/readings",
      expect.any(Function),
    );
  });

  test("should delegate valid messages to the reading service", async () => {
    connectAndSubscribe();
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

  test("should default the timestamp to now when omitted", async () => {
    connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: 18, unit: "°C" })),
    );

    expect(ingestReadingMock).toHaveBeenCalledTimes(1);
    const input = ingestReadingMock.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    expect(Math.abs(input!.timestamp.getTime() - Date.now())).toBeLessThan(5000);
  });

  test("should ignore invalid topics", async () => {
    connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler("wrong/topic", Buffer.from("{}"));
    await messageHandler("sensors/foo/bar/readings", Buffer.from("{}"));
    await messageHandler(`sensors/${VALID_SENSOR_ID}/events`, Buffer.from("{}"));

    expect(ingestReadingMock).not.toHaveBeenCalled();
  });

  test("should ignore invalid sensor ids", async () => {
    connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler(
      "sensors/not-an-object-id/readings",
      Buffer.from(JSON.stringify({ value: 1, unit: "°C" })),
    );

    expect(ingestReadingMock).not.toHaveBeenCalled();
  });

  test("should ignore malformed JSON payloads", async () => {
    connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from("{not json"),
    );

    expect(ingestReadingMock).not.toHaveBeenCalled();
  });

  test("should ignore payloads failing validation", async () => {
    connectAndSubscribe();
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

  test("should skip messages for unknown sensors without throwing", async () => {
    ingestReadingMock.mockRejectedValue(
      new SensorNotFoundError(VALID_SENSOR_ID),
    );
    connectAndSubscribe();
    const messageHandler = getMessageHandler();

    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: 22.5, unit: "°C" })),
    );

    expect(ingestReadingMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown sensor"),
    );
  });

  test("should swallow unexpected service errors without throwing", async () => {
    ingestReadingMock.mockRejectedValue(new Error("db down"));
    connectAndSubscribe();
    const messageHandler = getMessageHandler();
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await messageHandler(
      `sensors/${VALID_SENSOR_ID}/readings`,
      Buffer.from(JSON.stringify({ value: 22.5, unit: "°C" })),
    );

    expect(ingestReadingMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error processing MQTT message"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
