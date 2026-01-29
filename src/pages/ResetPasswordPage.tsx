import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token mancante");
      setValidating(false);
      return;
    }

    // Validate token
    fetch(`/api/auth/local/validate-reset-token?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setValid(false);
        } else {
          setValid(true);
        }
      })
      .catch((err) => {
        setError("Errore nella validazione del token");
        console.error(err);
      })
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Le password non corrispondono");
      return;
    }

    if (password.length < 8) {
      setError("La password deve essere almeno 8 caratteri");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/local/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess(true);
        // Redirect to login after 2 seconds
        setTimeout(() => navigate("/login"), 2000);
      }
    } catch (err) {
      setError("Errore durante il reset della password");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (validating) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Validazione...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!valid || error) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Errore</CardTitle>
            <CardDescription className="text-red-500">
              {error || "Token non valido o scaduto"}
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

  if (success) {
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
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Attendere..." : "Reimposta Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
