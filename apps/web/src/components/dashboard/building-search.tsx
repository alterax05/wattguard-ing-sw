import { useContext, useState, useMemo } from "react"
import { format } from "date-fns"
import { useTranslation } from "react-i18next"
import type { DateRange } from "react-day-picker"
import { useNavigate } from "react-router-dom"
import { useBuildings, useBuildingTypes, type BuildingSummary } from "@/hooks/use-buildings"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
  MapPin,
  Download,
  Eye,
  AlertCircle,
  Zap,
  Radio,
  FileText,
  FileSpreadsheet,
  FileType,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { AuthContext } from "@/lib/auth"
import { MAX_COMPARE_BUILDINGS } from "@/lib/constants"
import { downloadFromEndpoint } from "@/lib/download"
import {
  getBuildingStatusLabel,
  type BuildingStatus,
} from "@/lib/building-status"
import { BuildingStatusBadge } from "./building-status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DateRangePicker } from "./date-range-picker"

type ExportFormat = "csv" | "xlsx" | "pdf"

const EXPORT_ACTIONS = {
  csv: {
    url: "/api/export/consumption",
    formatParam: undefined,
    filename: (start: string, end: string) => `wattguard-consumption-${start}-${end}.csv`,
  },
  xlsx: {
    url: "/api/export/report",
    formatParam: "xlsx",
    filename: (start: string, end: string) => `wattguard-report-${start}-${end}.xlsx`,
  },
  pdf: {
    url: "/api/export/report",
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

/** Extract the building type display name from a summary */
function getBuildingTypeName(bt: BuildingSummary["buildingType"]): string {
  if (!(bt instanceof Object)) return bt
  return bt.name
}

export function BuildingSearch() {
  const { user } = useContext(AuthContext)
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
  const buildingTypes = typesData?.buildingTypes ?? []

  // Client-side filtering by search query and type
  const filteredBuildings = useMemo(() => {
    return buildings.filter((b) => {
      const matchesSearch =
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.address.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType =
        typeFilter === "all" ||
        (b.buildingType instanceof Object
          ? b.buildingType.id === typeFilter
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
      setSelectedIds(filteredBuildings.slice(0, MAX_COMPARE_BUILDINGS).map((b) => b.id))
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
    void navigate(`/dashboard/buildings/${id}`)
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
                    <SelectItem key={type.id} value={type.id}>
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
                        void navigate(`/dashboard/buildings/compare?ids=${ids}`)
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/50 py-16 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
          <p className="font-medium text-destructive">{t("buildings.loadErrorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ?? t("buildings.loadErrorDescription")}
          </p>
        </div>
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
            <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">{t("buildings.notFound")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("buildings.adjustFilters")}
              </p>
            </div>
          ) : (
            filteredBuildings.map((building) => {
              const isSelected = selectedIds.includes(building.id)
              return (
                <Card
                  key={building.id}
                  className={`group cursor-pointer transition-all hover:shadow-md ${
                    isSelected
                      ? "ring-2 ring-primary"
                      : "hover:ring-1 hover:ring-border"
                  }`}
                  onClick={() => {
                    handleBuildingClick(building.id)
                  }}
                >
                  <CardContent>
                    <div className="flex items-start gap-3">
                      {/* Admin checkbox */}
                      {isAdmin && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!isSelected && selectedIds.length >= MAX_COMPARE_BUILDINGS) return
                            toggleSelect(building.id)
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={!isSelected && selectedIds.length >= MAX_COMPARE_BUILDINGS}
                          />
                        </div>
                      )}

                      <div className="flex-1 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
                              {building.name}
                            </h3>
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {building.address}
                            </div>
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {getBuildingTypeName(building.buildingType)}
                          </Badge>
                        </div>

                        {/* Stats row */}
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-1.5">
                            <BuildingStatusBadge status={building.status} />
                          </div>
                          <Separator orientation="vertical" className="h-4" />
                          <div className="flex items-center gap-1 text-xs text-muted-foreground" title={t("buildings.activeSensors")}>
                            <Radio className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">{building.activeSensors}</span>
                          </div>
                          {building.currentConsumption !== null && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <div className="flex items-center gap-1 text-xs" title={t("buildings.currentConsumption")}>
                                <Zap className="h-3.5 w-3.5 text-chart-1" />
                                <span className="font-medium text-chart-1">
                                  {building.currentConsumption.toFixed(1)} {t("common.kwh")}
                                </span>
                              </div>
                            </>
                          )}
                          <Separator orientation="vertical" className="h-4" />
                          <div className="text-xs text-muted-foreground">
                            {building.surface} {t("common.squareMeters")}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
