import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useValidateResetToken, useResetPassword } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const tokenQuery = useValidateResetToken(token);
  const resetPassword = useResetPassword();

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (password !== passwordConfirm) {
      setValidationError("Le password non corrispondono");
      return;
    }

    if (password.length < 8) {
      setValidationError("La password deve essere almeno 8 caratteri");
      return;
    }

    resetPassword.mutate(
      { token: token!, password },
      {
        onSuccess: () => {
          // Redirect to login after 2 seconds
          setTimeout(() => navigate("/login"), 2000);
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
            <CardTitle className="mt-2">Validazione...</CardTitle>
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
            <CardTitle>Errore</CardTitle>
            <CardDescription className="text-red-500">
              {!token
                ? "Token mancante"
                : tokenQuery.error?.message ?? "Token non valido o scaduto"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">
                Richiedi nuovo link
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
            <CardTitle>Password Reimpostata</CardTitle>
            <CardDescription className="text-green-600">
              La tua password è stata reimpostata con successo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Verrai reindirizzato al login tra un attimo...
            </p>
            <Link to="/login">
              <Button className="w-full">Vai al Login</Button>
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
      <Card>
        <CardHeader>
          <CardTitle>Reimposta Password</CardTitle>
          <CardDescription>Scegli una nuova password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">Nuova Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Almeno 8 caratteri"
                required
              />
            </div>
            <div>
              <Label htmlFor="passwordConfirm">Conferma Password</Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Ripeti la password"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={resetPassword.isPending} className="w-full">
              {resetPassword.isPending ? "Attendere..." : "Reimposta Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
