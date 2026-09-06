import { useState, useMemo } from "react"
import { format } from "date-fns"
import { useTranslation } from "react-i18next"
import type { DateRange } from "react-day-picker"
import { useNavigate } from "react-router-dom"
import { useBuildings } from "@/hooks/use-buildings"
import { useBuildingTypes } from "@/hooks/use-building-types"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Building2,
  Download,
  Eye,
  AlertCircle,
  FileText,
  FileSpreadsheet,
  FileType,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { MAX_COMPARE_BUILDINGS } from "@/lib/constants"
import { downloadFromEndpoint } from "@/lib/download"
import {
  getBuildingStatusLabel,
} from "@/lib/building-status"
import type { BuildingStatus } from "@wattguard/shared"
import { BuildingCard } from "./building-search/BuildingCard"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { DateRangePicker } from "@/components/shared"

type ExportFormat = "csv" | "xlsx" | "pdf"

const EXPORT_ACTIONS = {
  csv: {
    url: "/api/v1/readings",
    formatParam: "csv",
    filename: (start: string, end: string) => `wattguard-consumption-${start}-${end}.csv`,
  },
  xlsx: {
    url: "/api/v1/reports",
    formatParam: "xlsx",
    filename: (start: string, end: string) => `wattguard-report-${start}-${end}.xlsx`,
  },
  pdf: {
    url: "/api/v1/reports",
    formatParam: "pdf",
    filename: (start: string, end: string) => `wattguard-report-${start}-${end}.pdf`,
  },
} satisfies Record<
  ExportFormat,
  {
    url: string
    formatParam?: string
    filename: (start: string, end: string) => string
  }
>


export function BuildingSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<BuildingStatus | "all">("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [exportRange, setExportRange] = useState<DateRange | undefined>()
  const [isExporting, setIsExporting] = useState(false)

  const isAdmin = user?.role === "admin"

  // Fetch buildings and building types from the API
  const { data: buildingsData, isLoading, isError, error } = useBuildings(
    statusFilter === "all" ? undefined : { status: statusFilter },
  )
  const { data: typesData } = useBuildingTypes()

  const buildings = useMemo(() => buildingsData?.buildings ?? [], [buildingsData])
  const buildingTypes = typesData ?? []

  // Client-side filtering by search query and type
  const filteredBuildings = useMemo(() => {
    return buildings.filter((b) => {
      const matchesSearch =
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.address.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType =
        typeFilter === "all" ||
        (b.buildingType instanceof Object
          ? b.buildingType._id === typeFilter
          : b.buildingType === typeFilter)
      return matchesSearch && matchesType
    })
  }, [buildings, searchQuery, typeFilter])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id)
      if (prev.length >= MAX_COMPARE_BUILDINGS) {
        toast.error(t("buildings.maxCompareReached", { count: MAX_COMPARE_BUILDINGS }))
        return prev
      }
      return [...prev, id]
    })
  }

  const selectAll = () => {
    if (selectedIds.length === filteredBuildings.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredBuildings.slice(0, MAX_COMPARE_BUILDINGS).map((b) => b._id))
    }
  }

  const handleExport = async (fileFormat: ExportFormat) => {
    if (!exportRange?.from || !exportRange?.to) {
      toast.error(t("buildings.selectExportRange"))
      return
    }

    const startDate = format(exportRange.from, "yyyy-MM-dd")
    const endDate = format(exportRange.to, "yyyy-MM-dd")
    const action = EXPORT_ACTIONS[fileFormat]

    const toastId = toast.loading(t(`buildings.export.loading.${fileFormat}`))
    setIsExporting(true)

    try {
      const params = new URLSearchParams({
        buildingIds: selectedIds.join(","),
        startDate,
        endDate,
      })
      if (action.formatParam) params.set("format", action.formatParam)

      await downloadFromEndpoint(
        `${action.url}?${params.toString()}`,
        action.filename(startDate, endDate),
      )
      toast.success(t(`buildings.export.success.${fileFormat}`), { id: toastId })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("buildings.export.error"),
        { id: toastId },
      )
    } finally {
      setIsExporting(false)
    }
  }

  const handleBuildingClick = (id: string) => {
    void navigate(`/buildings/${id}`)
  }

  return (
    <div className="space-y-6">
      {/* Search & Filters */}
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("buildings.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value) }}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder={t("buildings.type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("buildings.allTypes")}</SelectItem>
                  {buildingTypes.map((type) => (
                    <SelectItem key={type._id} value={type._id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  // SAFETY: the Select only offers the three building statuses plus "all".
                  setStatusFilter(value as BuildingStatus | "all")
                }}
              >
                <SelectTrigger className="w-full md:w-36">
                  <SelectValue placeholder={t("common.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="active">{getBuildingStatusLabel("active", t)}</SelectItem>
                  <SelectItem value="inactive">{getBuildingStatusLabel("inactive", t)}</SelectItem>
                  <SelectItem value="decommissioned">{getBuildingStatusLabel("decommissioned", t)}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Admin: multi-select controls & export */}
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={selectAll}
                  disabled={filteredBuildings.length === 0}
                >
                  {selectedIds.length === filteredBuildings.length && filteredBuildings.length > 0
                    ? t("buildings.deselectAll")
                    : t("buildings.selectAll")}
                </Button>

                {selectedIds.length > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      {t("buildings.selectedCount", {
                        selected: selectedIds.length,
                        max: MAX_COMPARE_BUILDINGS,
                      })}
                    </Badge>

                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        const ids = selectedIds.join(",")
                        void navigate(`/buildings/compare?ids=${ids}`)
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t("buildings.viewDetails")}
                    </Button>

                    <Separator orientation="vertical" className="h-6" />

                    {/* Date range picker */}
                    <DateRangePicker
                      value={exportRange}
                      onChange={setExportRange}
                      className="h-8"
                    />

                    <Separator orientation="vertical" className="h-6" />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          disabled={!exportRange?.from || !exportRange?.to || isExporting}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {isExporting ? t("buildings.export.inProgress") : t("buildings.export.downloadReport")}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => { void handleExport("csv") }}
                          disabled={isExporting}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          {t("buildings.export.csv")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { void handleExport("xlsx") }}
                          disabled={isExporting}
                        >
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          {t("buildings.export.xlsx")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { void handleExport("pdf") }}
                          disabled={isExporting}
                        >
                          <FileType className="mr-2 h-4 w-4" />
                          {t("buildings.export.pdf")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      {!isLoading && !isError && (
        <p className="text-sm text-muted-foreground">
          {t("buildings.resultsCount", { count: filteredBuildings.length })}
        </p>
      )}

      {/* Error state */}
      {isError && (
        <Empty className="border border-dashed border-destructive/50 py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="text-destructive">
              <AlertCircle className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle className="text-destructive">{t("buildings.loadErrorTitle")}</EmptyTitle>
            <EmptyDescription>
              {error?.message ?? t("buildings.loadErrorDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Building Cards */}
      {!isLoading && !isError && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredBuildings.length === 0 ? (
            <Empty className="col-span-full border border-dashed py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>{t("buildings.notFound")}</EmptyTitle>
                <EmptyDescription>{t("buildings.adjustFilters")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            filteredBuildings.map((building) => (
              <BuildingCard.Root
                key={building._id}
                isSelected={selectedIds.includes(building._id)}
                onClick={() => { handleBuildingClick(building._id) }}
              >
                {isAdmin && (
                  <BuildingCard.Checkbox
                    checked={selectedIds.includes(building._id)}
                    disabled={
                      !selectedIds.includes(building._id) &&
                      selectedIds.length >= MAX_COMPARE_BUILDINGS
                    }
                    onCheckedChange={() => { toggleSelect(building._id) }}
                  />
                )}
                <BuildingCard.Body building={building} />
              </BuildingCard.Root>
            ))
          )}
        </div>
      )}
    </div>
  )
}
