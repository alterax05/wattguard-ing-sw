import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { connectAndSubscribe } from "./mqtt";
import mqtt from "mqtt";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";
import { Alert } from "../models/Alert";

// Mock Mongoose models
let sensorFindByIdSpy: ReturnType<typeof spyOn>;
let readingCreateSpy: ReturnType<typeof spyOn>;
let alertDeleteManySpy: ReturnType<typeof spyOn>;

const mockSensorSave = mock();

// Mock MQTT Client
const mockOn = mock();
const mockSubscribe = mock();
const mockMqttClient = {
  on: mockOn,
  subscribe: mockSubscribe,
};

describe("MQTT Service", () => {
  let connectCallback: () => void;

  beforeEach(() => {
    sensorFindByIdSpy = spyOn(Sensor, "findById");
    readingCreateSpy = spyOn(SensorReading, "create");
    alertDeleteManySpy = spyOn(Alert, "deleteMany");

    mockSensorSave.mockReset();
    mockOn.mockReset();
    mockSubscribe.mockReset();

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
    sensorFindByIdSpy.mockRestore();
    readingCreateSpy.mockRestore();
    alertDeleteManySpy.mockRestore();
  });

  test("should connect and subscribe on initialization", () => {
    connectAndSubscribe();

    // Check connect was called
    expect(mqtt.connect).toHaveBeenCalled();

    // Trigger connect event
    if (connectCallback) connectCallback();

    // Check subscription
    expect(mockSubscribe).toHaveBeenCalledWith("sensors/+/readings", expect.any(Function));
  });

  test("should process valid message and save to database", async () => {
    connectAndSubscribe();
    
    // Simulate valid sensor found
    const mockSensorDoc = {
      _id: "sensor123",
      buildingId: "building123",
      sensorType: "internal_temp",
      save: mockSensorSave,
    };
    
    // Mock populate chain
    sensorFindByIdSpy.mockReturnValue({
      populate: () => Promise.resolve(mockSensorDoc)
    });
    readingCreateSpy.mockResolvedValue({});

    // Trigger message
    const topic = "sensors/sensor123/readings";
    const payload = JSON.stringify({
      value: 22.5,
      unit: "°C",
      timestamp: "2023-01-01T12:00:00Z"
    });
    
    // Find the 'message' handler
    const messageHandler = mockOn.mock.calls.find(call => call[0] === 'message')?.[1];
    expect(messageHandler).toBeDefined();

    // Execute handler
    await messageHandler(topic, Buffer.from(payload));

    // Verify DB interactions
    expect(Sensor.findById).toHaveBeenCalledWith("sensor123");
    expect(SensorReading.create).toHaveBeenCalled();
    expect(mockSensorSave).toHaveBeenCalled();
  });

  test("should keep existing alerts when a reading returns within thresholds", async () => {
    connectAndSubscribe();

    const mockSensorDoc = {
      _id: "sensor123",
      buildingId: "building123",
      sensorType: "internal_temp",
      minThreshold: 10,
      maxThreshold: 30,
      save: mockSensorSave,
    };

    sensorFindByIdSpy.mockReturnValue({
      populate: () => Promise.resolve(mockSensorDoc),
    });
    readingCreateSpy.mockResolvedValue({});

    const messageHandler = mockOn.mock.calls.find((call) => call[0] === "message")?.[1];
    expect(messageHandler).toBeDefined();

    await messageHandler(
      "sensors/sensor123/readings",
      Buffer.from(JSON.stringify({ value: 22.5, unit: "°C" })),
    );

    expect(alertDeleteManySpy).not.toHaveBeenCalled();
    expect(readingCreateSpy).toHaveBeenCalled();
  });

  test("should ignore invalid topics", async () => {
    connectAndSubscribe();
    const messageHandler = mockOn.mock.calls.find(call => call[0] === 'message')?.[1];

    await messageHandler("wrong/topic", Buffer.from("{}"));

    expect(Sensor.findById).not.toHaveBeenCalled();
  });
});
