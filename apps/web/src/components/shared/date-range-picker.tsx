import { useState } from "react"
import { addDays, format } from "date-fns"
import { useTranslation } from "react-i18next"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { getDateFnsLocale } from "@/lib/dates"
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

function formatDate(date: Date) {
  return format(date, "d MMM yyyy", { locale: getDateFnsLocale() })
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
  const { t } = useTranslation()

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
            <span>{t("dateRange.selectPeriod")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto flex-col gap-2 p-2">
        <Select
          onValueChange={(days) => {
            onChange({
              from: addDays(new Date(), -Number(days)),
              to: new Date(),
            })
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("dateRange.preset")} />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="7">{t("dateRange.last7Days")}</SelectItem>
            <SelectItem value="30">{t("dateRange.last30Days")}</SelectItem>
            <SelectItem value="90">{t("dateRange.last90Days")}</SelectItem>
            <SelectItem value="365">{t("dateRange.lastYear")}</SelectItem>
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
          {t("dateRange.clear")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
