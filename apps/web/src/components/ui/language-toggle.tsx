import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { client } from "@/lib/api";
import type { LocaleCode } from "@wattguard/shared";

const LANGUAGES: ReadonlyArray<{ code: LocaleCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
];

export function LanguageToggle() {
  const { t, i18n } = useTranslation();

  const changeLanguage = (code: LocaleCode) => {
    void i18n.changeLanguage(code);

    // Best-effort persistence of the preference for alert emails; silently
    // ignored when unauthenticated (login pages) or the request fails.
    void client.api.v1.auth.session
      .$patch({ json: { language: code } })
      .catch(() => undefined);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={t("common.language")}>
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">{t("common.language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map(({ code, label }) => (
          <DropdownMenuItem
            key={code}
            disabled={i18n.language === code}
            onClick={() => changeLanguage(code)}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
