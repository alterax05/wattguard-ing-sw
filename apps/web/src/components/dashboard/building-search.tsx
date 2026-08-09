import { useContext, useState, useMemo } from "react"
import { format } from "date-fns"
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

const EXPORT_ACTIONS: Record<
  ExportFormat,
  {
    url: string
    formatParam?: string
    filename: (start: string, end: string) => string
    loading: string
    success: string
  }
> = {
  csv: {
    url: "/api/export/consumption",
    filename: (start, end) => `wattguard-consumption-${start}-${end}.csv`,
    loading: "Preparazione esportazione CSV…",
    success: "Esportazione CSV completata",
  },
  xlsx: {
    url: "/api/export/report",
    formatParam: "xlsx",
    filename: (start, end) => `wattguard-report-${start}-${end}.xlsx`,
    loading: "Preparazione report Excel…",
    success: "Report Excel scaricato",
  },
  pdf: {
    url: "/api/export/report",
    formatParam: "pdf",
    filename: (start, end) => `wattguard-report-${start}-${end}.pdf`,
    loading: "Preparazione report PDF…",
    success: "Report PDF scaricato",
  },
}

/** Extract the building type display name from a summary */
function getBuildingTypeName(bt: BuildingSummary["buildingType"]): string {
  if (typeof bt === "string") return bt
  return bt.name
}

export function BuildingSearch() {
  const { user } = useContext(AuthContext)
  const navigate = useNavigate()
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
        (typeof b.buildingType === "object"
          ? b.buildingType.id === typeFilter
          : b.buildingType === typeFilter)
      return matchesSearch && matchesType
    })
  }, [buildings, searchQuery, typeFilter])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id)
      if (prev.length >= MAX_COMPARE_BUILDINGS) {
        toast.error(`Puoi confrontare al massimo ${MAX_COMPARE_BUILDINGS} edifici`)
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
      toast.error("Seleziona una data di inizio e una data di fine")
      return
    }

    const startDate = format(exportRange.from, "yyyy-MM-dd")
    const endDate = format(exportRange.to, "yyyy-MM-dd")
    const action = EXPORT_ACTIONS[fileFormat]

    const toastId = toast.loading(action.loading)
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
      toast.success(action.success, { id: toastId })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore durante l'esportazione",
        { id: toastId },
      )
    } finally {
      setIsExporting(false)
    }
  }

  const handleBuildingClick = (id: string) => {
    navigate(`/dashboard/buildings/${id}`)
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
                  placeholder="Cerca edificio per nome o indirizzo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="Tipologia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le tipologie</SelectItem>
                  {buildingTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as BuildingStatus | "all")}
              >
                <SelectTrigger className="w-full md:w-36">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">{getBuildingStatusLabel("active")}</SelectItem>
                  <SelectItem value="inactive">{getBuildingStatusLabel("inactive")}</SelectItem>
                  <SelectItem value="decommissioned">{getBuildingStatusLabel("decommissioned")}</SelectItem>
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
                    ? "Deseleziona tutti"
                    : "Seleziona tutti"}
                </Button>

                {selectedIds.length > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      {selectedIds.length}/{MAX_COMPARE_BUILDINGS} selezionati
                    </Badge>

                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        const ids = selectedIds.join(",")
                        navigate(`/dashboard/buildings/compare?ids=${ids}`)
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Vedi Dettagli
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
                          {isExporting ? "Esportazione..." : "Scarica report"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleExport("csv")}
                          disabled={isExporting}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExport("xlsx")}
                          disabled={isExporting}
                        >
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          Excel (.xlsx)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExport("pdf")}
                          disabled={isExporting}
                        >
                          <FileType className="mr-2 h-4 w-4" />
                          PDF
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
          {filteredBuildings.length} edifici trovati
        </p>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/50 py-16 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
          <p className="font-medium text-destructive">Errore nel caricamento</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ?? "Impossibile caricare gli edifici"}
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
              <p className="font-medium">Nessun edificio trovato</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Prova a modificare i filtri di ricerca
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
                          <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Sensori attivi">
                            <Radio className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">{building.activeSensors}</span>
                          </div>
                          {building.currentConsumption !== null && (
                            <>
                              <Separator orientation="vertical" className="h-4" />
                              <div className="flex items-center gap-1 text-xs" title="Consumo attuale">
                                <Zap className="h-3.5 w-3.5 text-chart-1" />
                                <span className="font-medium text-chart-1">
                                  {building.currentConsumption.toFixed(1)} kWh
                                </span>
                              </div>
                            </>
                          )}
                          <Separator orientation="vertical" className="h-4" />
                          <div className="text-xs text-muted-foreground">
                            {building.surface} m&sup2;
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
