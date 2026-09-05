import { useTranslation } from "react-i18next";
import type {BuildingType} from "@wattguard/shared"
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCreateBuildingType } from "@/hooks/use-building-types";
import { BuildingTypeForm, toBuildingTypePayload, useBuildingTypeForm, type BuildingTypeFormValues } from "./BuildingTypeForm";

interface AddBuildingTypeDialogProps {
  onClose: () => void;
  onCreated?: (buildingType: BuildingType) => void;
}

export function AddBuildingTypeDialog({ onClose, onCreated }: AddBuildingTypeDialogProps) {
  const createBuildingType = useCreateBuildingType();
  const { t } = useTranslation();
  const { form } = useBuildingTypeForm();
  const isPending = createBuildingType.isPending;

  const onValid = (values: BuildingTypeFormValues) => {
    createBuildingType.mutate(toBuildingTypePayload(values), {
      onSuccess: (data) => {
        toast.success(t("buildingTypes.created"));
        onCreated?.(data);
        onClose();
      },
      onError: (err) => {
        toast.error(t("buildingTypes.createError"), {
          description: err.message,
        });
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    void form.handleSubmit(onValid)(e);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogCloseButton />
        <DialogHeader>
          <DialogTitle>{t("buildingTypes.addTitle")}</DialogTitle>
          <DialogDescription>{t("buildingTypes.addDescription")}</DialogDescription>
        </DialogHeader>

        <BuildingTypeForm.Root form={form} isPending={isPending} onSubmit={handleSubmit}>
          <BuildingTypeForm.NameField />
          <BuildingTypeForm.DescriptionField />
          <BuildingTypeForm.Actions
            onCancel={onClose}
            isPending={isPending}
            submitLabel={t("buildingTypes.create")}
            pendingLabel={t("buildingTypes.creating")}
          />
        </BuildingTypeForm.Root>
      </DialogContent>
    </Dialog>
  );
}
