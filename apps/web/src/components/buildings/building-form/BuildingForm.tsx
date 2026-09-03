import * as React from "react"
import { useTranslation } from "react-i18next"
import { useFormContext, type UseFormReturn } from "react-hook-form"
import { Loader2, Search, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { BuildingMap } from "./BuildingMap"
import { TRENTO_CENTER } from "./geocode"
import { getBuildingStatusLabel } from "@/lib/building-status"
import type { BuildingFormValues } from "@/hooks/use-building-form"
import { useBuildingTypes } from "@/hooks/use-buildings"

// ── Context (state-decouple, lifted state for siblings) ─────────────────────

export interface BuildingFormContextValue {
  state: {
    mapCenter: [number, number] | null
    markerPosition: [number, number] | null
  }
  actions: {
    handleGeocode: () => Promise<void>
    handleMapClick: (lat: number, lng: number) => void
  }
  meta: {
    geocoding: boolean
    isPending: boolean
  }
}

const BuildingFormContext = React.createContext<BuildingFormContextValue | null>(null)

export function useBuildingFormContext() {
  const ctx = React.use(BuildingFormContext)
  if (!ctx) throw new Error("BuildingForm.* must be used within BuildingForm.Root")
  return {
    ...ctx,
    geocoding: ctx.meta.geocoding,
    isPending: ctx.meta.isPending,
    mapCenter: ctx.state.mapCenter,
    markerPosition: ctx.state.markerPosition,
    handleGeocode: ctx.actions.handleGeocode,
    handleMapClick: ctx.actions.handleMapClick,
  }
}

// ── Root ────────────────────────────────────────────────────────────────────
// Provider is the only place that knows how state is managed (RHF).
// Consumers compose via children — no boolean props.

export interface BuildingFormStateInput {
  form: UseFormReturn<BuildingFormValues>
  geocoding: boolean
  mapCenter: [number, number] | null
  markerPosition: [number, number] | null
  handleGeocode: () => Promise<void>
  handleMapClick: (lat: number, lng: number) => void
}

export interface BuildingFormRootProps {
  buildingForm?: BuildingFormStateInput
  form?: UseFormReturn<BuildingFormValues>
  geocoding?: boolean
  mapCenter?: [number, number] | null
  markerPosition?: [number, number] | null
  handleGeocode?: () => Promise<void>
  handleMapClick?: (lat: number, lng: number) => void
  isPending: boolean
  onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode
}

export function BuildingFormRoot({
  buildingForm,
  form: rawForm,
  geocoding: rawGeocoding,
  mapCenter: rawMapCenter,
  markerPosition: rawMarkerPosition,
  handleGeocode: rawHandleGeocode,
  handleMapClick: rawHandleMapClick,
  isPending,
  onSubmit,
  children,
}: BuildingFormRootProps) {
  const form = buildingForm?.form ?? rawForm!
  const geocoding = buildingForm?.geocoding ?? rawGeocoding ?? false
  const mapCenter = buildingForm?.mapCenter ?? rawMapCenter ?? null
  const markerPosition = buildingForm?.markerPosition ?? rawMarkerPosition ?? null
  const handleGeocode = buildingForm?.handleGeocode ?? rawHandleGeocode ?? (async () => {})
  const handleMapClick = buildingForm?.handleMapClick ?? rawHandleMapClick ?? (() => {})

  return (
    <Form {...form}>
      <BuildingFormContext
        value={{
          state: { mapCenter, markerPosition },
          actions: { handleGeocode, handleMapClick },
          meta: { geocoding, isPending },
        }}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
        </form>
      </BuildingFormContext>
    </Form>
  )
}

// ── Fields ──────────────────────────────────────────────────────────────────

export function BuildingFormNameField() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  return (
    <FormField
      name="name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("buildings.form.name")}</FormLabel>
          <FormControl>
            <Input
              placeholder={t("buildings.form.namePlaceholder")}
              disabled={isPending}
              {...field}
              id="building-name"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function BuildingFormAddressField() {
  const { t } = useTranslation()
  const { isPending, geocoding, handleGeocode } = useBuildingFormContext()
  const { watch } = useFormContext<BuildingFormValues>()
  const address = watch("address")
  return (
    <FormField
      name="address"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor="building-address">{t("buildings.form.address")}</FormLabel>
          <div className="flex gap-2">
            <FormControl>
              <Input
                placeholder={t("buildings.form.addressPlaceholder")}
                disabled={isPending}
                className="flex-1"
                {...field}
                id="building-address"
              />
            </FormControl>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { void handleGeocode() }}
              disabled={isPending || geocoding || !address?.trim()}
              title={t("buildings.form.geocodeButton")}
            >
              {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("buildings.form.geocodeHint")}</p>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function BuildingFormDimensionsFields() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField
        name="surface"
        render={({ field }) => (
          <FormItem>
            <FormLabel htmlFor="building-surface">{t("buildings.form.surface")}</FormLabel>
            <FormControl>
              <Input
                id="building-surface"
                type="number"
                min="0"
                step="any"
                placeholder={t("buildings.form.surfacePlaceholder")}
                disabled={isPending}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name="ceilingHeight"
        render={({ field }) => (
          <FormItem>
            <FormLabel htmlFor="building-ceiling">{t("buildings.form.ceilingHeight")}</FormLabel>
            <FormControl>
              <Input
                id="building-ceiling"
                type="number"
                min="0.5"
                step="0.1"
                placeholder={t("buildings.form.ceilingHeightPlaceholder")}
                disabled={isPending}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export function BuildingFormYearField() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  return (
    <FormField
      name="constructionYear"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor="building-year">{t("buildings.form.constructionYear")}</FormLabel>
          <FormControl>
            <Input
              id="building-year"
              type="number"
              min="1000"
              max={new Date().getFullYear() + 10}
              placeholder={t("buildings.form.constructionYearPlaceholder")}
              disabled={isPending}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function BuildingFormTypeField() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  const { data: buildingTypesData, isLoading: typesLoading } = useBuildingTypes()
  return (
    <FormField<BuildingFormValues>
      name="buildingType"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("buildings.form.type")}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={isPending || typesLoading}>
            <FormControl>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    typesLoading ? t("buildings.form.typesLoading") : t("buildings.form.typePlaceholder")
                  }
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {buildingTypesData?.buildingTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// Explicit variant for edit — not a boolean prop on the parent
export function BuildingFormStatusField() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  const { watch } = useFormContext<BuildingFormValues>()
  const status = watch("status")
  return (
    <FormField<BuildingFormValues>
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor="building-status">{t("common.status")}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
            <FormControl>
              <SelectTrigger id="building-status">
                <SelectValue placeholder={t("buildings.form.statusPlaceholder")} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="active">{getBuildingStatusLabel("active", t)}</SelectItem>
              <SelectItem value="inactive">{getBuildingStatusLabel("inactive", t)}</SelectItem>
              <SelectItem value="decommissioned">{getBuildingStatusLabel("decommissioned", t)}</SelectItem>
            </SelectContent>
          </Select>
          {status === "decommissioned" && (
            <p className="text-xs text-destructive">{t("buildings.form.decommissionWarning")}</p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function BuildingFormHeatingZoneFields() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField
        name="heatingSystemType"
        render={({ field }) => (
          <FormItem>
            <FormLabel htmlFor="building-heating">{t("buildings.form.heatingSystem")}</FormLabel>
            <FormControl>
              <Input
                id="building-heating"
                placeholder={t("buildings.form.heatingSystemPlaceholder")}
                disabled={isPending}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name="geographicZone"
        render={({ field }) => (
          <FormItem>
            <FormLabel htmlFor="building-zone">{t("buildings.form.geographicZone")}</FormLabel>
            <FormControl>
              <Input
                id="building-zone"
                placeholder={t("buildings.form.geographicZonePlaceholder")}
                disabled={isPending}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

export function BuildingFormCoordinatesFields() {
  const { t } = useTranslation()
  const { isPending } = useBuildingFormContext()
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <MapPin className="h-4 w-4" />
        {t("buildings.form.location")}
      </Label>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          name="latitude"
          render={({ field }) => (
            <FormItem>
              <Label htmlFor="building-lat" className="text-xs text-muted-foreground">
                {t("buildings.form.latitude")}
              </Label>
              <FormControl>
                <Input
                  id="building-lat"
                  type="number"
                  step="any"
                  placeholder={t("buildings.form.latitudePlaceholder")}
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="longitude"
          render={({ field }) => (
            <FormItem>
              <Label htmlFor="building-lng" className="text-xs text-muted-foreground">
                {t("buildings.form.longitude")}
              </Label>
              <FormControl>
                <Input
                  id="building-lng"
                  type="number"
                  step="any"
                  placeholder={t("buildings.form.longitudePlaceholder")}
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("buildings.form.mapHint")}</p>
    </div>
  )
}

export function BuildingFormMapSection() {
  const { mapCenter, markerPosition, handleMapClick } = useBuildingFormContext()
  return (
    <div className="space-y-2">
      <BuildingMap
        position={markerPosition}
        center={mapCenter}
        defaultCenter={TRENTO_CENTER}
        onPositionChange={handleMapClick}
      />
    </div>
  )
}

interface BuildingFormActionsProps {
  onCancel: () => void
  submitLabel: string
  pendingLabel: string
  isPending: boolean
  disableSubmit?: boolean
}

export function BuildingFormActions({
  onCancel,
  submitLabel,
  pendingLabel,
  isPending,
  disableSubmit,
}: BuildingFormActionsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={isPending || disableSubmit}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {pendingLabel}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  )
}

// Compound export — explicit, no booleans
export const BuildingForm = {
  Root: BuildingFormRoot,
  NameField: BuildingFormNameField,
  AddressField: BuildingFormAddressField,
  DimensionsFields: BuildingFormDimensionsFields,
  YearField: BuildingFormYearField,
  TypeField: BuildingFormTypeField,
  StatusField: BuildingFormStatusField,
  HeatingZoneFields: BuildingFormHeatingZoneFields,
  CoordinatesFields: BuildingFormCoordinatesFields,
  MapSection: BuildingFormMapSection,
  Actions: BuildingFormActions,
  Context: BuildingFormContext,
}
