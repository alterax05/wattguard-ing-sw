import { memo, useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, Loader2, MoreVertical, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";

import { useBuildingTypes, useDeleteBuildingType, type BuildingType } from "@/hooks/use-building-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { AddBuildingTypeDialog } from "./add-building-type-dialog";
import { EditBuildingTypeDialog } from "./edit-building-type-dialog";

// ── Row (memoized, defined outside the parent — never inline) ─────────────────

interface BuildingTypeRowProps {
  buildingType: BuildingType;
  isAdmin: boolean;
  onEdit: (buildingType: BuildingType) => void;
  onDelete: (buildingType: BuildingType) => void;
}

const BuildingTypeRow = memo(function BuildingTypeRow({ buildingType, isAdmin, onEdit, onDelete }: BuildingTypeRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Tags className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{buildingType.name}</p>
          {buildingType.description ? (
            <p className="truncate text-xs text-muted-foreground">{buildingType.description}</p>
          ) : null}
        </div>
      </div>
      {isAdmin ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">{t("common.actions")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { onEdit(buildingType); }}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => { onDelete(buildingType); }}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
});

// ── Management ────────────────────────────────────────────────────────────────

interface BuildingTypesManagementProps {
  isAdmin: boolean;
}

export function BuildingTypesManagement({ isAdmin }: BuildingTypesManagementProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useBuildingTypes();
  const deleteBuildingType = useDeleteBuildingType();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<BuildingType | null>(null);
  const [deleting, setDeleting] = useState<BuildingType | null>(null);

  // Defer the filter so typing stays responsive on long lists.
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const types = data ?? [];
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return types;
    return types.filter(
      (bt) => bt.name.toLowerCase().includes(q) || (bt.description ?? "").toLowerCase().includes(q),
    );
  }, [data, deferredSearch]);

  const handleDeleteConfirm = () => {
    if (!deleting) return;
    const target = deleting;
    deleteBuildingType.mutate(target._id, {
      onSuccess: () => {
        toast.success(t("buildingTypes.deleted"));
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(t("buildingTypes.deleteError"), {
          description: err.message,
        });
        setDeleting(null);
      },
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("buildingTypes.manage")}</CardTitle>
            {isAdmin ? (
              <Button size="sm" onClick={() => { setShowAdd(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                {t("buildingTypes.add")}
              </Button>
            ) : null}
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("buildingTypes.searchPlaceholder")}
              value={search}
              onChange={(e) => { setSearch(e.target.value); }}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="text-destructive">
                  <AlertCircle className="h-6 w-6" />
                </EmptyMedia>
                <EmptyDescription className="text-destructive">
                  {error?.message ?? t("buildingTypes.loadError")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty className="border border-dashed py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Tags className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>{t("buildingTypes.empty")}</EmptyTitle>
                <EmptyDescription>{t("buildingTypes.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {filtered.map((bt) => (
                <BuildingTypeRow
                  key={bt._id}
                  buildingType={bt}
                  isAdmin={isAdmin}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showAdd ? <AddBuildingTypeDialog onClose={() => { setShowAdd(false); }} /> : null}
      {editing ? <EditBuildingTypeDialog buildingType={editing} onClose={() => { setEditing(null); }} /> : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("buildingTypes.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("buildingTypes.deleteConfirmDescription", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBuildingType.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm} disabled={deleteBuildingType.isPending}>
              {deleteBuildingType.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.deleting")}
                </>
              ) : (
                t("common.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
