import { useTranslation } from "react-i18next"
import { useWatch } from "react-hook-form"
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useCreateBuilding } from "@/hooks/use-buildings"
import { useBuildingForm, toBuildingPayload, type BuildingFormValues } from "@/hooks/use-building-form"
import { BuildingForm } from "./building-form/BuildingForm"

interface AddBuildingDialogProps {
  onClose: () => void
}

export function AddBuildingDialog({ onClose }: AddBuildingDialogProps) {
  const createBuilding = useCreateBuilding()
  const { t } = useTranslation()
  const buildingForm = useBuildingForm({})
  const { form } = buildingForm

  const isPending = createBuilding.isPending
  // NOTE: useWatch (not form.watch) — render-time watch() reads are frozen
  // by React Compiler memoization; useWatch subscribes and stays reactive.
  const buildingType = useWatch({ control: form.control, name: "buildingType" })

  const onValid = (values: BuildingFormValues) => {
    const { status: _status, ...payload } = toBuildingPayload(values)
    void _status
    createBuilding.mutate(
      {
        name: payload.name,
        address: payload.address,
        surface: payload.surface,
        ceilingHeight: payload.ceilingHeight,
        location: payload.location,
        buildingType: payload.buildingType,
        heatingSystemType: payload.heatingSystemType,
        constructionYear: payload.constructionYear,
        geographicZone: payload.geographicZone,
      },
      {
        onSuccess: () => {
          toast.success(t("buildings.created"))
          onClose()
        },
        onError: (err) => {
          toast.error(t("buildings.createError"), {
            description: err.message,
          })
        },
      }
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    void form.handleSubmit(onValid)(e)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("buildings.addTitle")}</DialogTitle>
          <DialogDescription>{t("buildings.addDescription")}</DialogDescription>
        </DialogHeader>

        <BuildingForm.Root
          buildingForm={buildingForm}
          isPending={isPending}
          onSubmit={handleSubmit}
        >
          <BuildingForm.NameField />
          <BuildingForm.AddressField />
          <BuildingForm.DimensionsFields />
          <BuildingForm.YearField />
          <BuildingForm.TypeField />
          <BuildingForm.HeatingZoneFields />
          <BuildingForm.CoordinatesFields />
          <BuildingForm.MapSection />
          <BuildingForm.Actions
            onCancel={onClose}
            isPending={isPending}
            submitLabel={t("buildings.create")}
            pendingLabel={t("buildings.creating")}
            disableSubmit={!buildingType}
          />
        </BuildingForm.Root>
      </DialogContent>
    </Dialog>
  )
}
