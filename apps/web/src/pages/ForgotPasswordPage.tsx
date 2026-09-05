import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useForgotPassword } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import fullLogo from "@wattguard/shared/assets/full-logo.png";
import fullLogoBlack from "@wattguard/shared/assets/full-logo-black.png";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const { theme } = useTheme();
  const forgotPassword = useForgotPassword();
  const { t } = useTranslation();

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    forgotPassword.mutate({ email });
  };

  if (forgotPassword.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <ModeToggle />
          <LanguageToggle />
        </div>
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center space-y-6">
            <img
              src={theme === "dark" ? fullLogoBlack : fullLogo}
              alt="WattGuard"
              className="h-24 w-auto object-contain"
            />
          </div>
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center">{t("auth.emailSent")}</CardTitle>
              <CardDescription className="text-center">
                {t("auth.emailSentSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t("auth.emailSentHint")}
              </p>
              <Link to="/login" className="block">
                <Button variant="outline" className="w-full">
                  {t("auth.backToSignIn")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ModeToggle />
        <LanguageToggle />
      </div>
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-6">
          <img
            src={theme === "dark" ? fullLogoBlack : fullLogo}
            alt="WattGuard"
            className="h-24 w-auto object-contain"
          />
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">{t("auth.forgotPasswordTitle")}</CardTitle>
            <CardDescription className="text-center">
              {t("auth.forgotPasswordSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value) }}
                  required
                  placeholder={t("auth.emailPlaceholder")}
                />
              </div>
              {forgotPassword.error && (
                <p className="text-sm text-destructive">{forgotPassword.error.message}</p>
              )}
              <Button type="submit" disabled={forgotPassword.isPending} className="w-full">
                {forgotPassword.isPending ? t("auth.sending") : t("auth.sendResetLink")}
              </Button>
              <Link to="/login" className="block">
                <Button variant="ghost" className="w-full">
                  {t("auth.backToSignIn")}
                </Button>
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
