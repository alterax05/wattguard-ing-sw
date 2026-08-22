import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { useLogin } from "@/hooks/use-auth";
import { client } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import fullLogo from "@wattguard/shared/assets/full-logo.png";
import fullLogoBlack from "@wattguard/shared/assets/full-logo-black.png";

/** Map OAuth error codes (from Google callback redirects) to i18n auth.* keys. */
const OAUTH_ERROR_KEYS = {
  no_account: "auth.oauthNoAccount",
  account_disabled: "auth.oauthAccountDisabled",
  account_mismatch: "auth.oauthAccountMismatch",
  email_not_verified: "auth.oauthEmailNotVerified",
  token_exchange_failed: "auth.oauthTokenExchangeFailed",
  invalid_state: "auth.oauthInvalidState",
  missing_params: "auth.oauthMissingParams",
  server_error: "auth.oauthServerError",
} satisfies Record<string, string>;

/** Resolve an OAuth error code (from Google callback redirects) to its i18n key. */
function oauthErrorKey(code: string): string {
  const match = Object.entries(OAUTH_ERROR_KEYS).find(([key]) => key === code);
  return match?.[1] ?? "auth.oauthFailed";
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useLogin();
  const { t } = useTranslation();

  const oauthError = searchParams.get("error");
  const oauthErrorMessage = oauthError
    ? t(oauthErrorKey(oauthError))
    : null;

  const handleLogin = (e: React.SubmitEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          void navigate("/dashboard");
        },
      },
    );
  };

  const handleGoogleLogin = () => {
    const url = client.api.v1.auth.google.login.$url();
    window.location.href = url.toString();
  };

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
            <CardTitle className="text-2xl font-bold text-center">{t("auth.signIn")}</CardTitle>
            <CardDescription className="text-center">
              {t("auth.signInSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {oauthErrorMessage && (
              <p className="text-sm text-destructive text-center mb-4">{oauthErrorMessage}</p>
            )}
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t("auth.continueWithGoogle")}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t("common.or")}</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value) }}
                    placeholder={t("auth.emailPlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value) }}
                    placeholder={t("auth.passwordPlaceholder")}
                    required
                  />
                </div>
                {login.error && (
                  <p className="text-sm text-destructive">{login.error.message}</p>
                )}
                <Button type="submit" disabled={login.isPending} className="w-full">
                  {login.isPending ? t("auth.signingIn") : t("auth.signIn")}
                </Button>
                <div className="text-center pt-2">
                  <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default LoginPage;
