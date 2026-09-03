import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { useUpdateBuilding, type BuildingDetail } from "@/hooks/use-buildings"
import { useBuildingForm, toBuildingPayload, type BuildingFormValues } from "@/hooks/use-building-form"
import { BuildingForm } from "./building-form/BuildingForm"

interface EditBuildingDialogProps {
  building: BuildingDetail
  onClose: () => void
}

export function EditBuildingDialog({ building, onClose }: EditBuildingDialogProps) {
  const updateBuilding = useUpdateBuilding()
  const { t } = useTranslation()
  const buildingForm = useBuildingForm({ mode: "edit", building })
  const { form } = buildingForm

  const [confirmDecommission, setConfirmDecommission] = useState(false)
  const isPending = updateBuilding.isPending
  const buildingType = form.watch("buildingType")

  const performUpdate = (values: BuildingFormValues) => {
    const payload = toBuildingPayload(values)
    updateBuilding.mutate(
      {
        id: building.id,
        name: payload.name,
        address: payload.address,
        surface: payload.surface,
        ceilingHeight: payload.ceilingHeight,
        location: payload.location,
        buildingType: payload.buildingType,
        heatingSystemType: payload.heatingSystemType,
        constructionYear: payload.constructionYear,
        geographicZone: payload.geographicZone,
        status: payload.status,
      },
      {
        onSuccess: () => {
          toast.success(t("buildings.updated"))
          onClose()
        },
        onError: (err) => {
          toast.error(t("buildings.updateError"), {
            description: err.message,
          })
        },
      }
    )
  }

  const onValid = (values: BuildingFormValues) => {
    if (values.status === "decommissioned" && building.status !== "decommissioned") {
      setConfirmDecommission(true)
      return
    }
    performUpdate(values)
  }

  const handleSubmit = (e: React.FormEvent) => {
    void form.handleSubmit(onValid)(e)
  }

  const handleConfirmDecommission = () => {
    setConfirmDecommission(false)
    const values = form.getValues()
    performUpdate(values)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("buildings.editTitle")}</DialogTitle>
          <DialogDescription>{t("buildings.editDescription")}</DialogDescription>
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
          {/* Explicit variant: edit shows Type + Status side-by-side */}
          <div className="grid grid-cols-2 gap-4">
            <BuildingForm.TypeField />
            <BuildingForm.StatusField />
          </div>
          <BuildingForm.HeatingZoneFields />
          <BuildingForm.CoordinatesFields />
          <BuildingForm.MapSection />
          <BuildingForm.Actions
            onCancel={onClose}
            isPending={isPending}
            submitLabel={t("buildings.saveChanges")}
            pendingLabel={t("buildings.saving")}
            disableSubmit={!buildingType}
          />
        </BuildingForm.Root>
      </DialogContent>

      {/* Sibling outside Form Frame but inside Dialog — proves state-lift */}
      <AlertDialog open={confirmDecommission} onOpenChange={setConfirmDecommission}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("buildings.decommissionConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("buildings.decommissionConfirmDescription", { name: building.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirmDecommission}
              disabled={isPending}
            >
              {t("buildings.decommissionConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
