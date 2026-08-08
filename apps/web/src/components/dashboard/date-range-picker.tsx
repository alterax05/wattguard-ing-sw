import { useState } from "react"
import { addDays, format } from "date-fns"
import { it } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PRESETS: { label: string; days: number }[] = [
  { label: "Ultimi 7 giorni", days: 7 },
  { label: "Ultimi 30 giorni", days: 30 },
  { label: "Ultimi 90 giorni", days: 90 },
  { label: "Ultimo anno", days: 365 },
]

function formatDate(date: Date) {
  return format(date, "d MMM yyyy", { locale: it })
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-8 w-auto justify-start gap-2 text-left text-xs font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {formatDate(value.from)} - {formatDate(value.to)}
              </>
            ) : (
              formatDate(value.from)
            )
          ) : (
            <span>Seleziona un periodo</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col gap-2 p-2">
        <Select
          onValueChange={(days) =>
            onChange({
              from: addDays(new Date(), -Number(days)),
              to: new Date(),
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Preset" />
          </SelectTrigger>
          <SelectContent position="popper">
            {PRESETS.map((preset) => (
              <SelectItem key={preset.days} value={String(preset.days)}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="rounded-md border">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          disabled={!value}
          onClick={() => {
            onChange(undefined)
            setOpen(false)
          }}
        >
          Cancella
        </Button>
      </PopoverContent>
    </Popover>
  )
}
