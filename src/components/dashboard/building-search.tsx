import { useContext, useState, useMemo } from "react"
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
  FileSpreadsheet,
  FileText,
  Calendar,
  Eye,
  AlertCircle,
  Zap,
  Radio,
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { AuthContext } from "@/lib/auth"

/** Extract the building type display name from a summary */
function getBuildingTypeName(bt: BuildingSummary["buildingType"]): string {
  if (typeof bt === "string") return bt
  return bt.name
}

/** Get a color for the status badge */
function getStatusBadge(status: BuildingSummary["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="secondary" className="bg-chart-3/15 text-chart-3 text-xs">Attivo</Badge>
    case "inactive":
      return <Badge variant="secondary" className="text-xs">Inattivo</Badge>
    case "decommissioned":
      return <Badge variant="secondary" className="bg-destructive/15 text-destructive text-xs">Dismesso</Badge>
  }
}

export function BuildingSearch() {
  const { user } = useContext(AuthContext)
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const isAdmin = user?.role === "admin"

  // Fetch buildings and building types from the API
  const { data: buildingsData, isLoading, isError, error } = useBuildings()
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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedIds.length === filteredBuildings.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredBuildings.map((b) => b.id))
    }
  }

  const handleExport = (format: "csv" | "excel" | "pdf") => {
    const selectedNames = buildings
      .filter((b) => selectedIds.includes(b.id))
      .map((b) => b.name)
      .join(", ")

    const period =
      dateFrom && dateTo
        ? ` dal ${dateFrom} al ${dateTo}`
        : " (ultimo mese)"

    const formatLabels = { csv: "CSV", excel: "Excel", pdf: "PDF" }

    toast.success(
      `Report ${formatLabels[format]} generato per: ${selectedNames}${period}`
    )
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
            <div className="grid grid-cols-6 gap-4">
              <div className="relative col-span-5">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca edificio per nome o indirizzo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
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
                      {selectedIds.length} selezionati
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
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 w-36 text-xs"
                        placeholder="Da"
                      />
                      <span className="text-xs text-muted-foreground">-</span>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 w-36 text-xs"
                        placeholder="A"
                      />
                    </div>

                    <Separator orientation="vertical" className="h-6" />

                    {/* Export buttons */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Scarica Report
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="start">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Formato di esportazione
                          </Label>
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            size="sm"
                            onClick={() => handleExport("csv")}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            CSV
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            size="sm"
                            onClick={() => handleExport("excel")}
                          >
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Excel (.xlsx)
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            size="sm"
                            onClick={() => handleExport("pdf")}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            PDF
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
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
                            toggleSelect(building.id)
                          }}
                        >
                          <Checkbox checked={isSelected} />
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
                            {getStatusBadge(building.status)}
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
