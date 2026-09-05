import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useValidateResetToken, useResetPassword } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Loader2 } from "lucide-react";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const { t } = useTranslation();

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const tokenQuery = useValidateResetToken(token);
  const resetPassword = useResetPassword();

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (password !== passwordConfirm) {
      setValidationError(t("auth.passwordMismatch"));
      return;
    }

    if (password.length < 8) {
      setValidationError(t("auth.validationPasswordMin"));
      return;
    }

    resetPassword.mutate(
      { token: token!, password },
      {
        onSuccess: () => {
          // Redirect to login after 2 seconds
          setTimeout(() => {
              void navigate("/login");
          }, 2000);
        },
      },
    );
  };

  // Loading state while validating token
  if (tokenQuery.isLoading) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader className="flex items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <CardTitle className="mt-2">{t("auth.validating")}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Token missing or invalid
  if (!token || tokenQuery.isError) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{t("common.error")}</CardTitle>
            <CardDescription className="text-red-500">
              {!token
                ? t("auth.resetTokenMissing")
                : tokenQuery.error?.message ?? t("auth.resetTokenInvalidOrExpired")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">
                {t("auth.requestNewLink")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (resetPassword.isSuccess) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.passwordResetSuccess")}</CardTitle>
            <CardDescription className="text-green-600">
              {t("auth.passwordResetSuccessMessage")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t("auth.redirectingToLogin")}
            </p>
            <Link to="/login">
              <Button className="w-full">{t("auth.goToLogin")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form
  const error = validationError ?? resetPassword.error?.message ?? null;

  return (
    <div className="container mx-auto p-8 max-w-md">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ModeToggle />
        <LanguageToggle />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.resetPasswordTitle")}</CardTitle>
          <CardDescription>{t("auth.chooseNewPassword")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">{t("auth.newPassword")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value) }}
                placeholder={t("auth.passwordMinLength")}
                required
              />
            </div>
            <div>
              <Label htmlFor="passwordConfirm">{t("auth.confirmPassword")}</Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => { setPasswordConfirm(e.target.value) }}
                placeholder={t("auth.confirmPasswordPlaceholder")}
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={resetPassword.isPending} className="w-full">
              {resetPassword.isPending ? t("auth.resetting") : t("auth.resetPasswordTitle")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ResetPasswordPage;
