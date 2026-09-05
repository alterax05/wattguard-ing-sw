import * as React from "react";
import { useMemo } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { BuildingType } from "@/hooks/use-building-types";

// ── Form shape ────────────────────────────────────────────────────────────────

export interface BuildingTypeFormValues {
  name: string;
  description: string;
}

function createSchema(t: TFunction) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("buildingTypes.form.nameRequired", { defaultValue: "Name is required" })),
    // Optional on the wire: empty string is sent as `undefined` by toBuildingTypePayload.
    description: z.string().trim(),
  });
}

export function toBuildingTypePayload(values: BuildingTypeFormValues): {
  name: string;
  description?: string;
} {
  const name = values.name.trim();
  const description = values.description.trim();
  return description ? { name, description } : { name };
}

// ── Hook (explicit initial values, no boolean mode prop) ─────────────────────

export function useBuildingTypeForm(buildingType?: BuildingType) {
  const { t } = useTranslation();
  const schema = useMemo(() => createSchema(t), [t]);

  const form = useForm<BuildingTypeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: buildingType?.name ?? "",
      description: buildingType?.description ?? "",
    },
    mode: "onTouched",
  });

  return { form, schema };
}

// ── Context (provider is the only place that knows about RHF) ────────────────

interface BuildingTypeFormContextValue {
  meta: {
    isPending: boolean;
  };
}

const BuildingTypeFormContext = React.createContext<BuildingTypeFormContextValue | null>(null);

export function useBuildingTypeFormContext() {
  const ctx = React.use(BuildingTypeFormContext);
  if (!ctx) throw new Error("BuildingTypeForm.* must be used within BuildingTypeForm.Root");
  return ctx;
}

// ── Root ──────────────────────────────────────────────────────────────────────

interface BuildingTypeFormRootProps {
  form: UseFormReturn<BuildingTypeFormValues>;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}

export function BuildingTypeFormRoot({ form, isPending, onSubmit, children }: BuildingTypeFormRootProps) {
  return (
    <Form {...form}>
      <BuildingTypeFormContext value={{ meta: { isPending } }}>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
        </form>
      </BuildingTypeFormContext>
    </Form>
  );
}

// ── Fields ────────────────────────────────────────────────────────────────────

export function BuildingTypeFormNameField() {
  const { t } = useTranslation();
  const { meta } = useBuildingTypeFormContext();
  return (
    <FormField
      name="name"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor="building-type-name">{t("buildingTypes.form.name")}</FormLabel>
          <FormControl>
            <Input
              id="building-type-name"
              placeholder={t("buildingTypes.form.namePlaceholder")}
              disabled={meta.isPending}
              autoFocus
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function BuildingTypeFormDescriptionField() {
  const { t } = useTranslation();
  const { meta } = useBuildingTypeFormContext();
  return (
    <FormField
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor="building-type-description">{t("buildingTypes.form.description")}</FormLabel>
          <FormControl>
            <Textarea
              id="building-type-description"
              placeholder={t("buildingTypes.form.descriptionPlaceholder")}
              disabled={meta.isPending}
              rows={3}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface BuildingTypeFormActionsProps {
  onCancel: () => void;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
}

export function BuildingTypeFormActions({ onCancel, submitLabel, pendingLabel, isPending }: BuildingTypeFormActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={isPending}>
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
  );
}

// Compound export — explicit, no booleans
export const BuildingTypeForm = {
  Root: BuildingTypeFormRoot,
  NameField: BuildingTypeFormNameField,
  DescriptionField: BuildingTypeFormDescriptionField,
  Actions: BuildingTypeFormActions,
  Context: BuildingTypeFormContext,
};
