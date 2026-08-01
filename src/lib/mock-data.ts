export const mockStats = {
  electricity: {
    total: 12450,
    change: -8,
  },
  gas: {
    total: 3280,
    change: 12,
  },
  water: {
    total: 1560,
    change: -3,
  },
  sensors: {
    active: 42,
    total: 48,
  },
  alerts: {
    active: 7,
  },
}

export const mockChartData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (29 - i))
  return {
    date: date.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
    electricity: Math.round(Math.random() * 200 + 300),
    gas: Math.round(Math.random() * 80 + 90),
    water: Math.round(Math.random() * 40 + 30),
  }
})

export const mockBuildings = [
  {
    _id: "1",
    name: "Palazzo Comunale",
    type: "Uffici Amministrativi",
    address: "Piazza Duomo, 18",
    coordinates: { lat: 46.0664, lng: 11.1257 },
    surface: 3500,
    activeSensors: 12,
    currentConsumption: 287,
  },
  {
    _id: "2",
    name: "Biblioteca Comunale",
    type: "Servizi Culturali",
    address: "Via Roma, 55",
    coordinates: { lat: 46.0698, lng: 11.1211 },
    surface: 2100,
    activeSensors: 8,
    currentConsumption: 156,
  },
  {
    _id: "3",
    name: "Scuola Primaria Centro",
    type: "Edificio Scolastico",
    address: "Via Manzoni, 12",
    coordinates: { lat: 46.0712, lng: 11.1289 },
    surface: 4200,
    activeSensors: 15,
    currentConsumption: 412,
  },
  {
    _id: "4",
    name: "Palestra Comunale Nord",
    type: "Impianto Sportivo",
    address: "Via Brescia, 3",
    coordinates: { lat: 46.0755, lng: 11.1245 },
    surface: 1800,
    activeSensors: 7,
    currentConsumption: 198,
  },
  {
    _id: "5",
    name: "Centro Anziani",
    type: "Servizi Sociali",
    address: "Via Verdi, 22",
    coordinates: { lat: 46.0631, lng: 11.1278 },
    surface: 950,
    activeSensors: 5,
    currentConsumption: 89,
  },
]

export const mockSensors = [
  // Palazzo Comunale
  {
    _id: "s1",
    buildingId: "1",
    buildingName: "Palazzo Comunale",
    buildingAddress: "Piazza Duomo, 18",
    type: "electricity",
    name: "Sensore Elettrico Piano Terra",
    unit: "kWh",
    status: "active",
    lastReading: 287.5,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    _id: "s2",
    buildingId: "1",
    buildingName: "Palazzo Comunale",
    buildingAddress: "Piazza Duomo, 18",
    type: "gas",
    name: "Contatore Gas Centrale",
    unit: "m³",
    status: "active",
    lastReading: 45.2,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    _id: "s3",
    buildingId: "1",
    buildingName: "Palazzo Comunale",
    buildingAddress: "Piazza Duomo, 18",
    type: "temperature",
    name: "Temperatura Sala Riunioni",
    unit: "°C",
    status: "active",
    lastReading: 21.5,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    _id: "s4",
    buildingId: "1",
    buildingName: "Palazzo Comunale",
    buildingAddress: "Piazza Duomo, 18",
    type: "water",
    name: "Contatore Acqua Principale",
    unit: "m³",
    status: "active",
    lastReading: 12.8,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  // Biblioteca
  {
    _id: "s5",
    buildingId: "2",
    buildingName: "Biblioteca Comunale",
    buildingAddress: "Via Roma, 55",
    type: "electricity",
    name: "Sensore Elettrico Sala Lettura",
    unit: "kWh",
    status: "active",
    lastReading: 156.3,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    _id: "s6",
    buildingId: "2",
    buildingName: "Biblioteca Comunale",
    buildingAddress: "Via Roma, 55",
    type: "temperature",
    name: "Temperatura Archivio",
    unit: "°C",
    status: "error",
    lastReading: 28.9,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    _id: "s7",
    buildingId: "2",
    buildingName: "Biblioteca Comunale",
    buildingAddress: "Via Roma, 55",
    type: "gas",
    name: "Contatore Gas",
    unit: "m³",
    status: "active",
    lastReading: 23.1,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  // Scuola
  {
    _id: "s8",
    buildingId: "3",
    buildingName: "Scuola Primaria Centro",
    buildingAddress: "Via Manzoni, 12",
    type: "electricity",
    name: "Sensore Elettrico Ala Est",
    unit: "kWh",
    status: "active",
    lastReading: 412.7,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    _id: "s9",
    buildingId: "3",
    buildingName: "Scuola Primaria Centro",
    buildingAddress: "Via Manzoni, 12",
    type: "water",
    name: "Contatore Acqua Bagni",
    unit: "m³",
    status: "active",
    lastReading: 34.5,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
  {
    _id: "s10",
    buildingId: "3",
    buildingName: "Scuola Primaria Centro",
    buildingAddress: "Via Manzoni, 12",
    type: "gas",
    name: "Caldaia Principale",
    unit: "m³",
    status: "active",
    lastReading: 78.9,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  {
    _id: "s11",
    buildingId: "3",
    buildingName: "Scuola Primaria Centro",
    buildingAddress: "Via Manzoni, 12",
    type: "temperature",
    name: "Temperatura Palestra",
    unit: "°C",
    status: "inactive",
    lastReading: 19.2,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  // Palestra
  {
    _id: "s12",
    buildingId: "4",
    buildingName: "Palestra Comunale Nord",
    buildingAddress: "Via Brescia, 3",
    type: "electricity",
    name: "Sensore Elettrico Generale",
    unit: "kWh",
    status: "active",
    lastReading: 198.4,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    _id: "s13",
    buildingId: "4",
    buildingName: "Palestra Comunale Nord",
    buildingAddress: "Via Brescia, 3",
    type: "water",
    name: "Contatore Spogliatoi",
    unit: "m³",
    status: "active",
    lastReading: 56.7,
    lastReadingAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
  },
]

export const mockAlerts = [
  {
    _id: "a1",
    buildingId: "2",
    buildingName: "Biblioteca Comunale",
    sensorId: "s6",
    type: "temperature_anomaly",
    severity: "critical",
    message: "Temperatura archivio fuori range: 28.9°C (limite: 22°C)",
    status: "active",
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    _id: "a2",
    buildingId: "1",
    buildingName: "Palazzo Comunale",
    sensorId: "s1",
    type: "consumption_spike",
    severity: "high",
    message: "Picco anomalo consumo elettrico: +45% rispetto alla media",
    status: "active",
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    _id: "a3",
    buildingId: "3",
    buildingName: "Scuola Primaria Centro",
    sensorId: "s11",
    type: "sensor_offline",
    severity: "medium",
    message: "Sensore temperatura palestra non risponde da 3 ore",
    status: "acknowledged",
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    acknowledgedBy: "Mario Rossi",
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    _id: "a4",
    buildingId: "4",
    buildingName: "Palestra Comunale Nord",
    sensorId: "s13",
    type: "consumption_spike",
    severity: "medium",
    message: "Consumo acqua superiore alla media del 30%",
    status: "active",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    _id: "a5",
    buildingId: "5",
    buildingName: "Centro Anziani",
    type: "system_warning",
    severity: "low",
    message: "Manutenzione programmata caldaia prevista entro 7 giorni",
    status: "active",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    _id: "a6",
    buildingId: "2",
    buildingName: "Biblioteca Comunale",
    sensorId: "s5",
    type: "consumption_spike",
    severity: "high",
    message: "Consumo elettrico notturno anomalo rilevato",
    status: "resolved",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    acknowledgedBy: "Laura Bianchi",
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    resolvedBy: "Laura Bianchi",
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    _id: "a7",
    buildingId: "1",
    buildingName: "Palazzo Comunale",
    type: "maintenance_scheduled",
    severity: "low",
    message: "Verifica annuale contatori programmata per domani",
    status: "acknowledged",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    acknowledgedBy: "Giovanni Verdi",
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
]

// Generate mock sensor readings for charts (last 24 hours)
export function generateMockSensorReadings(sensorType: string) {
  return Array.from({ length: 24 }, (_, i) => {
    const time = new Date()
    time.setHours(time.getHours() - (23 - i))

    let value: number
    switch (sensorType) {
      case "electricity":
        value = Math.random() * 50 + 200
        break
      case "gas":
        value = Math.random() * 20 + 30
        break
      case "water":
        value = Math.random() * 10 + 15
        break
      case "temperature":
        value = Math.random() * 3 + 20
        break
      default:
        value = Math.random() * 100
    }

    return {
      timestamp: time.toISOString(),
      value: Math.round(value * 10) / 10,
    }
  })
}

// Extended building data for detail view
export const mockBuildingDetails: Record<string, {
  energyClass: string
  yearBuilt: number
  floors: number
  heatingSystem: string
  lastRenovation: string
  monthlyConsumption: Array<{ month: string; electricity: number; gas: number; water: number }>
  sensors: Array<{ id: string; name: string; type: string; status: string; value: number; unit: string }>
}> = {
  "1": {
    energyClass: "B",
    yearBuilt: 1920,
    floors: 4,
    heatingSystem: "Teleriscaldamento",
    lastRenovation: "2019",
    monthlyConsumption: [
      { month: "Gen", electricity: 3200, gas: 1800, water: 120 },
      { month: "Feb", electricity: 3100, gas: 1650, water: 115 },
      { month: "Mar", electricity: 2900, gas: 1200, water: 118 },
      { month: "Apr", electricity: 2700, gas: 600, water: 125 },
      { month: "Mag", electricity: 2800, gas: 200, water: 130 },
      { month: "Giu", electricity: 3400, gas: 100, water: 145 },
      { month: "Lug", electricity: 3800, gas: 80, water: 160 },
      { month: "Ago", electricity: 2200, gas: 60, water: 100 },
      { month: "Set", electricity: 3000, gas: 300, water: 135 },
      { month: "Ott", electricity: 2850, gas: 900, water: 128 },
      { month: "Nov", electricity: 3050, gas: 1500, water: 120 },
      { month: "Dic", electricity: 3300, gas: 1900, water: 118 },
    ],
    sensors: [
      { id: "s1", name: "Contatore Elettrico PT", type: "electricity", status: "active", value: 287.5, unit: "kWh" },
      { id: "s2", name: "Contatore Gas", type: "gas", status: "active", value: 45.2, unit: "m\u00b3" },
      { id: "s3", name: "Temp. Sala Riunioni", type: "temperature", status: "active", value: 21.5, unit: "\u00b0C" },
      { id: "s4", name: "Contatore Acqua", type: "water", status: "active", value: 12.8, unit: "m\u00b3" },
    ],
  },
  "2": {
    energyClass: "C",
    yearBuilt: 1965,
    floors: 2,
    heatingSystem: "Caldaia a condensazione",
    lastRenovation: "2021",
    monthlyConsumption: [
      { month: "Gen", electricity: 1800, gas: 1200, water: 65 },
      { month: "Feb", electricity: 1750, gas: 1100, water: 60 },
      { month: "Mar", electricity: 1600, gas: 800, water: 62 },
      { month: "Apr", electricity: 1500, gas: 400, water: 68 },
      { month: "Mag", electricity: 1550, gas: 150, water: 72 },
      { month: "Giu", electricity: 1900, gas: 80, water: 80 },
      { month: "Lug", electricity: 2100, gas: 50, water: 85 },
      { month: "Ago", electricity: 1200, gas: 40, water: 55 },
      { month: "Set", electricity: 1650, gas: 200, water: 70 },
      { month: "Ott", electricity: 1600, gas: 600, water: 66 },
      { month: "Nov", electricity: 1700, gas: 1000, water: 63 },
      { month: "Dic", electricity: 1850, gas: 1250, water: 60 },
    ],
    sensors: [
      { id: "s5", name: "Sensore Elettrico Sala Lettura", type: "electricity", status: "active", value: 156.3, unit: "kWh" },
      { id: "s6", name: "Temperatura Archivio", type: "temperature", status: "error", value: 28.9, unit: "\u00b0C" },
      { id: "s7", name: "Contatore Gas", type: "gas", status: "active", value: 23.1, unit: "m\u00b3" },
    ],
  },
  "3": {
    energyClass: "D",
    yearBuilt: 1978,
    floors: 3,
    heatingSystem: "Caldaia tradizionale",
    lastRenovation: "2015",
    monthlyConsumption: [
      { month: "Gen", electricity: 4500, gas: 2800, water: 220 },
      { month: "Feb", electricity: 4300, gas: 2600, water: 210 },
      { month: "Mar", electricity: 4000, gas: 2000, water: 215 },
      { month: "Apr", electricity: 3800, gas: 1000, water: 225 },
      { month: "Mag", electricity: 3500, gas: 300, water: 230 },
      { month: "Giu", electricity: 2500, gas: 100, water: 200 },
      { month: "Lug", electricity: 1500, gas: 50, water: 150 },
      { month: "Ago", electricity: 1200, gas: 40, water: 120 },
      { month: "Set", electricity: 3800, gas: 500, water: 220 },
      { month: "Ott", electricity: 4100, gas: 1500, water: 218 },
      { month: "Nov", electricity: 4400, gas: 2400, water: 215 },
      { month: "Dic", electricity: 4600, gas: 2900, water: 210 },
    ],
    sensors: [
      { id: "s8", name: "Sensore Elettrico Ala Est", type: "electricity", status: "active", value: 412.7, unit: "kWh" },
      { id: "s9", name: "Contatore Acqua Bagni", type: "water", status: "active", value: 34.5, unit: "m\u00b3" },
      { id: "s10", name: "Caldaia Principale", type: "gas", status: "active", value: 78.9, unit: "m\u00b3" },
      { id: "s11", name: "Temp. Palestra", type: "temperature", status: "inactive", value: 19.2, unit: "\u00b0C" },
    ],
  },
  "4": {
    energyClass: "B",
    yearBuilt: 2005,
    floors: 1,
    heatingSystem: "Pompa di calore",
    lastRenovation: "2022",
    monthlyConsumption: [
      { month: "Gen", electricity: 2200, gas: 400, water: 180 },
      { month: "Feb", electricity: 2100, gas: 350, water: 175 },
      { month: "Mar", electricity: 2000, gas: 250, water: 180 },
      { month: "Apr", electricity: 1900, gas: 100, water: 190 },
      { month: "Mag", electricity: 1800, gas: 50, water: 200 },
      { month: "Giu", electricity: 2300, gas: 30, water: 250 },
      { month: "Lug", electricity: 2500, gas: 20, water: 280 },
      { month: "Ago", electricity: 2400, gas: 20, water: 260 },
      { month: "Set", electricity: 2100, gas: 80, water: 220 },
      { month: "Ott", electricity: 1950, gas: 200, water: 195 },
      { month: "Nov", electricity: 2050, gas: 350, water: 185 },
      { month: "Dic", electricity: 2250, gas: 420, water: 180 },
    ],
    sensors: [
      { id: "s12", name: "Sensore Elettrico Generale", type: "electricity", status: "active", value: 198.4, unit: "kWh" },
      { id: "s13", name: "Contatore Spogliatoi", type: "water", status: "active", value: 56.7, unit: "m\u00b3" },
    ],
  },
  "5": {
    energyClass: "A",
    yearBuilt: 2018,
    floors: 2,
    heatingSystem: "Pompa di calore + Fotovoltaico",
    lastRenovation: "-",
    monthlyConsumption: [
      { month: "Gen", electricity: 950, gas: 100, water: 45 },
      { month: "Feb", electricity: 900, gas: 90, water: 42 },
      { month: "Mar", electricity: 850, gas: 60, water: 44 },
      { month: "Apr", electricity: 800, gas: 30, water: 48 },
      { month: "Mag", electricity: 750, gas: 10, water: 50 },
      { month: "Giu", electricity: 900, gas: 5, water: 55 },
      { month: "Lug", electricity: 1000, gas: 5, water: 58 },
      { month: "Ago", electricity: 700, gas: 5, water: 40 },
      { month: "Set", electricity: 820, gas: 15, water: 48 },
      { month: "Ott", electricity: 860, gas: 50, water: 46 },
      { month: "Nov", electricity: 920, gas: 80, water: 44 },
      { month: "Dic", electricity: 960, gas: 110, water: 43 },
    ],
    sensors: [
      { id: "s14", name: "Inverter Fotovoltaico", type: "electricity", status: "active", value: 89.2, unit: "kWh" },
      { id: "s15", name: "Pompa di Calore", type: "temperature", status: "active", value: 22.1, unit: "\u00b0C" },
    ],
  },
}

export const mockUsers = [
  {
    _id: "u1",
    name: "Mario Rossi",
    email: "mario.rossi@comune.trento.it",
    role: "operator",
    createdAt: new Date("2024-01-15").toISOString(),
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    _id: "u2",
    name: "Laura Bianchi",
    email: "laura.bianchi@comune.trento.it",
    role: "operator",
    createdAt: new Date("2024-02-20").toISOString(),
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    _id: "u3",
    name: "Giovanni Verdi",
    email: "giovanni.verdi@comune.trento.it",
    role: "admin",
    createdAt: new Date("2023-11-10").toISOString(),
    lastLogin: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    _id: "u4",
    name: "Francesca Neri",
    email: "francesca.neri@comune.trento.it",
    role: "operator",
    createdAt: new Date("2024-03-05").toISOString(),
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
]
