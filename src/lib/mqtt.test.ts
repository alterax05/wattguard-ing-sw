import { describe, test, expect, mock, beforeEach } from "bun:test";
import { connectAndSubscribe } from "./mqtt";
import mqtt from "mqtt";
import { Sensor } from "../models/Sensor";
import { SensorReading } from "../models/SensorReading";

// Mock Mongoose models
const mockSensorFindById = mock();
const mockSensorSave = mock();
const mockReadingCreate = mock();

Sensor.findById = mockSensorFindById;
SensorReading.create = mockReadingCreate;

// Mock MQTT Client
const mockOn = mock();
const mockSubscribe = mock();
const mockMqttClient = {
  on: mockOn,
  subscribe: mockSubscribe,
};

describe("MQTT Service", () => {
  let clientCallback: (topic: string, message: Buffer) => void;
  let connectCallback: () => void;

  beforeEach(() => {
    mockSensorFindById.mockReset();
    mockSensorSave.mockReset();
    mockReadingCreate.mockReset();
    mockOn.mockReset();
    mockSubscribe.mockReset();

    // Setup basic mock behavior
    mockOn.mockImplementation((event: string, cb: any) => {
      if (event === "message") clientCallback = cb;
      if (event === "connect") connectCallback = cb;
      return mockMqttClient;
    });

    // Mock the connect function
    // @ts-ignore
    mqtt.connect = mock(() => mockMqttClient);
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
    mockSensorFindById.mockResolvedValue(mockSensorDoc);
    mockReadingCreate.mockResolvedValue({});

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

  test("should ignore invalid topics", async () => {
    connectAndSubscribe();
    const messageHandler = mockOn.mock.calls.find(call => call[0] === 'message')?.[1];

    await messageHandler("wrong/topic", Buffer.from("{}"));

    expect(Sensor.findById).not.toHaveBeenCalled();
  });
});
