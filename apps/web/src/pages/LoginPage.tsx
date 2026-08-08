import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { useLogin } from "@/hooks/use-auth";
import { client } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/ui/mode-toggle";

/** Map OAuth error codes (from Google callback redirects) to user-friendly messages. */
const OAUTH_ERRORS: Record<string, string> = {
  no_account: "No account found for this Google email. Contact your administrator.",
  account_disabled: "Your account has been disabled.",
  account_mismatch: "This Google account is linked to a different user.",
  email_not_verified: "Your Google email is not verified.",
  token_exchange_failed: "Google authentication failed. Please try again.",
  invalid_state: "Authentication session expired. Please try again.",
  missing_params: "Google authentication failed. Please try again.",
  server_error: "An unexpected error occurred. Please try again.",
};

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useLogin();

  const oauthError = searchParams.get("error");
  const oauthErrorMessage = oauthError ? OAUTH_ERRORS[oauthError] ?? "Authentication failed." : null;

  const handleLogin = async (e: React.SubmitEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          navigate("/dashboard");
        },
      },
    );
  };

  const handleGoogleLogin = () => {
    const url = client.api.auth.google.login.$url();
    window.location.href = url.toString();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-6">
          <img
            src={theme === "dark" ? "/images/full-logo-black.png" : "/images/full-logo.png"}
            alt="WattGuard"
            className="h-24 w-auto object-contain"
          />
        </div>
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access WattGuard
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
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
                {login.error && (
                  <p className="text-sm text-destructive">{login.error.message}</p>
                )}
                <Button type="submit" disabled={login.isPending} className="w-full">
                  {login.isPending ? "Signing in..." : "Sign In"}
                </Button>
                <div className="text-center pt-2">
                  <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Forgot your password?
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
