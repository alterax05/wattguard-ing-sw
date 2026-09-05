import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useUpdateBuildingType, type BuildingType } from "@/hooks/use-building-types";
import { BuildingTypeForm, toBuildingTypePayload, useBuildingTypeForm, type BuildingTypeFormValues } from "./BuildingTypeForm";

interface EditBuildingTypeDialogProps {
  buildingType: BuildingType;
  onClose: () => void;
}

export function EditBuildingTypeDialog({ buildingType, onClose }: EditBuildingTypeDialogProps) {
  const updateBuildingType = useUpdateBuildingType();
  const { t } = useTranslation();
  const { form } = useBuildingTypeForm(buildingType);
  const isPending = updateBuildingType.isPending;

  const onValid = (values: BuildingTypeFormValues) => {
    updateBuildingType.mutate(
      { id: buildingType._id, ...toBuildingTypePayload(values) },
      {
        onSuccess: () => {
          toast.success(t("buildingTypes.updated"));
          onClose();
        },
        onError: (err) => {
          toast.error(t("buildingTypes.updateError"), {
            description: err.message,
          });
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    void form.handleSubmit(onValid)(e);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("buildingTypes.editTitle")}</DialogTitle>
          <DialogDescription>{t("buildingTypes.editDescription")}</DialogDescription>
        </DialogHeader>

        <BuildingTypeForm.Root form={form} isPending={isPending} onSubmit={handleSubmit}>
          <BuildingTypeForm.NameField />
          <BuildingTypeForm.DescriptionField />
          <BuildingTypeForm.Actions
            onCancel={onClose}
            isPending={isPending}
            submitLabel={t("buildingTypes.saveChanges")}
            pendingLabel={t("buildingTypes.saving")}
          />
        </BuildingTypeForm.Root>
      </DialogContent>
    </Dialog>
  );
}
