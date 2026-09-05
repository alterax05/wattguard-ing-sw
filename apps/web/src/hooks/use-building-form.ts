import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { toast } from "sonner"
import { geocodeAddress } from "@/components/buildings/building-form/geocode"
import type { BuildingDetail } from "@/hooks/use-buildings"
import type { BuildingStatus, CreateBuildingRequest } from "@wattguard/shared"
import { BuildingStatusSchema } from "@wattguard/shared"

// ── Form shape ────────────────────────────────────────────────────────────────
// Strings for inputs (keeps <Input> controlled); numbers parsed on submit.
export type BuildingFormValues = {
  name: string
  address: string
  surface: string
  ceilingHeight: string
  buildingType: string
  heatingSystemType: string
  constructionYear: string
  geographicZone: string
  status: BuildingStatus
  latitude: string
  longitude: string
}

export type BuildingFormMode = "create" | "edit"

function createSchema(t: TFunction) {
  // Use t() for Zod messages so FormMessage is localized.
  return z.object({
    name: z.string().trim().min(1, t("buildings.form.nameRequired", { defaultValue: "Name is required" })),
    address: z.string().trim().min(1, t("buildings.form.addressRequired", { defaultValue: "Address is required" })),
    surface: z
      .string()
      .trim()
      .min(1, t("buildings.form.surfaceRequired", { defaultValue: "Surface is required" }))
      .refine((v) => {
        const n = parseFloat(v)
        return !isNaN(n) && n > 0
      }, t("buildings.form.surfaceInvalid", { defaultValue: "Surface must be positive" })),
    ceilingHeight: z
      .string()
      .trim()
      .min(1, t("buildings.form.ceilingHeightRequired", { defaultValue: "Ceiling height is required" }))
      .refine((v) => {
        const n = parseFloat(v)
        return !isNaN(n) && n >= 0.5 && n <= 20
      }, t("buildings.form.ceilingHeightInvalid", { defaultValue: "Height must be between 0.5 and 20" })),
    buildingType: z
      .string()
      .trim()
      .min(1, t("buildings.form.typeRequired", { defaultValue: "Building type is required" })),
    heatingSystemType: z
      .string()
      .trim()
      .min(1, t("buildings.form.heatingSystemRequired", { defaultValue: "Heating system is required" })),
    constructionYear: z
      .string()
      .trim()
      .refine((v) => {
        if (!v) return true
        const n = parseInt(v, 10)
        const max = new Date().getFullYear() + 10
        return !isNaN(n) && n >= 1000 && n <= max
      }, t("buildings.form.constructionYearInvalid", { defaultValue: "Invalid year" })),
    geographicZone: z
      .string()
      .trim()
      .min(1, t("buildings.form.geographicZoneRequired", { defaultValue: "Geographic zone is required" })),
    status: BuildingStatusSchema,
    latitude: z
      .string()
      .trim()
      .min(1, t("buildings.form.coordinatesRequired", { defaultValue: "Latitude is required" }))
      .refine((v) => {
        const n = parseFloat(v)
        return !isNaN(n) && n >= -90 && n <= 90
      }, t("buildings.form.coordinatesInvalid", { defaultValue: "Invalid coordinates" })),
    longitude: z
      .string()
      .trim()
      .min(1, t("buildings.form.coordinatesRequired", { defaultValue: "Longitude is required" }))
      .refine((v) => {
        const n = parseFloat(v)
        return !isNaN(n) && n >= -180 && n <= 180
      }, t("buildings.form.coordinatesInvalid", { defaultValue: "Invalid coordinates" })),
  })
}

export type BuildingFormSchema = ReturnType<typeof createSchema>

function toDefaultValues(building?: BuildingDetail, _mode: BuildingFormMode = "create"): BuildingFormValues {
  if (building) {
    return {
      name: building.name,
      address: building.address,
      surface: building.surface.toString(),
      ceilingHeight: building.ceilingHeight ? building.ceilingHeight.toString() : "3.0",
      // SAFETY: BuildingType union is string ID or populated object with _id; instanceof Object narrows to object case
      buildingType: building.buildingType instanceof Object ? (building.buildingType as { _id: string })._id : building.buildingType,
      heatingSystemType: building.heatingSystemType,
      constructionYear: building.constructionYear ? building.constructionYear.toString() : "",
      geographicZone: building.geographicZone,
      status: building.status,
      latitude: building.location.coordinates[1].toString(),
      longitude: building.location.coordinates[0].toString(),
    }
  }
  return {
    name: "",
    address: "",
    surface: "",
    ceilingHeight: "3.0",
    buildingType: "",
    heatingSystemType: "",
    constructionYear: "",
    geographicZone: "",
    status: "active",
    latitude: "",
    longitude: "",
  }
}

type BuildingPayload = CreateBuildingRequest & {
  status?: BuildingStatus
}

export function toBuildingPayload(values: BuildingFormValues): BuildingPayload {
  const surface = parseFloat(values.surface)
  const ceilingHeight = parseFloat(values.ceilingHeight)
  const lat = parseFloat(values.latitude)
  const lng = parseFloat(values.longitude)
  const payload: BuildingPayload = {
    name: values.name.trim(),
    address: values.address.trim(),
    surface,
    ceilingHeight,
    location: { type: "Point", coordinates: [lng, lat] },
    buildingType: values.buildingType,
    heatingSystemType: values.heatingSystemType.trim(),
    geographicZone: values.geographicZone.trim(),
  }
  if (values.constructionYear.trim()) {
    payload.constructionYear = parseInt(values.constructionYear, 10)
  }
  // status only relevant for edit; caller decides whether to include
  if (values.status) {
    payload.status = values.status
  }
  return payload
}

interface UseBuildingFormOptions {
  mode: BuildingFormMode
  building?: BuildingDetail
}

export function useBuildingForm({ mode, building }: UseBuildingFormOptions) {
  const { t } = useTranslation()
  const schema = useMemo(() => createSchema(t), [t])

  const form = useForm<BuildingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaultValues(building, mode),
    mode: "onTouched",
  })

  // Re-hydrate when building changes (edit flow) — mirrors settings-panel reset pattern
  useEffect(() => {
    if (building) {
      form.reset(toDefaultValues(building, mode))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps — form.reset stable, we want building change only
  }, [building?._id])

  const [mapCenter, setMapCenter] = useState<[number, number] | null>(() => {
    if (building) {
      return [building.location.coordinates[1], building.location.coordinates[0]]
    }
    return null
  })
  const [geocoding, setGeocoding] = useState(false)

  // Keep mapCenter in sync when building changes
  useEffect(() => {
    if (building) {
      setMapCenter([building.location.coordinates[1], building.location.coordinates[0]])
    }
  }, [building])

  const address = form.watch("address")

  const markerPosition = useMemo<[number, number] | null>(() => {
    const lat = form.watch("latitude")
    const lng = form.watch("longitude")
    if (lat && lng) {
      const la = parseFloat(lat)
      const ln = parseFloat(lng)
      if (!isNaN(la) && !isNaN(ln)) return [la, ln]
    }
    return null
  }, [form])

  const handleGeocode = useCallback(async () => {
    const currentAddress = form.getValues("address")
    if (!currentAddress.trim()) {
      toast.error(t("buildings.form.geocodeNoAddress"))
      return
    }
    setGeocoding(true)
    try {
      const result = await geocodeAddress(currentAddress)
      if (result) {
        form.setValue("latitude", result.lat.toFixed(6), { shouldDirty: true, shouldValidate: true })
        form.setValue("longitude", result.lon.toFixed(6), { shouldDirty: true, shouldValidate: true })
        setMapCenter([result.lat, result.lon])
        toast.success(t("buildings.form.coordinatesFound"))
      } else {
        toast.error(t("buildings.form.addressNotFound"), {
          description: t("buildings.form.addressNotFoundHint"),
        })
      }
    } catch {
      toast.error(t("buildings.form.geocodeError"))
    } finally {
      setGeocoding(false)
    }
  }, [form, t])

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      form.setValue("latitude", lat.toFixed(6), { shouldDirty: true, shouldValidate: true })
      form.setValue("longitude", lng.toFixed(6), { shouldDirty: true, shouldValidate: true })
    },
    [form]
  )

  return {
    form,
    schema,
    mapCenter,
    markerPosition,
    geocoding,
    handleGeocode,
    handleMapClick,
    address,
  }
}
