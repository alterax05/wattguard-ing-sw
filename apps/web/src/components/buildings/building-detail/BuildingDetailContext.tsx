import React from "react"
import type { DateRange } from "react-day-picker"
import type { BuildingDetail, RealTimeData } from "@/hooks/use-buildings"
import type { SensorWithBuilding } from "@/hooks/use-sensors"
import type { SensorTypeKey } from "./helpers"

export interface BuildingDetailContextValue {
  state: {
    buildingId: string
    building: BuildingDetail
    realTimeData?: RealTimeData
    sensors: SensorWithBuilding[]
    allSensors: SensorWithBuilding[]
    activeSensors: number
    totalSensors: number
    totalPages: number
    displayPage: number
    range: DateRange | undefined
    selectedSensorType: SensorTypeKey
    chartData: { timestamp: string; value: number; sensorType: string; unit: string }[]
    isAdmin: boolean
  }
  actions: {
    setRange: (range: DateRange | undefined) => void
    setSelectedSensorType: (type: SensorTypeKey) => void
    setPage: (page: number) => void
    openAddSensor: () => void
    openEditSensor: (id: string) => void
    openDeleteSensor: (sensor: SensorWithBuilding) => void
    openEditBuilding: () => void
    openDeleteBuilding: () => void
    goBack: () => void
  }
  meta: {
    buildingLoading: boolean
    sensorsLoading: boolean
    historyLoading: boolean
  }
}

export const BuildingDetailContext = React.createContext<BuildingDetailContextValue | null>(null)

export function useBuildingDetailContext() {
  const ctx = React.use(BuildingDetailContext)
  if (!ctx) {
    throw new Error("BuildingDetail subcomponents must be used within BuildingDetailProvider")
  }
  return ctx
}

export function useOptionalBuildingDetailContext() {
  return React.use(BuildingDetailContext)
}
