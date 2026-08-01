import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [inviteData, setInviteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"choice" | "password">("choice");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token mancante");
      setLoading(false);
      return;
    }

    // Validate invite token
    fetch(`/api/invites/validate?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setInviteData(data);
        }
      })
      .catch((err) => {
        setError("Errore nella validazione dell'invito");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleGoogleLogin = () => {
    window.location.href = `/api/auth/google/start?inviteToken=${token}`;
  };

  const handlePasswordSetup = async () => {
    if (password !== passwordConfirm) {
      setError("Le password non corrispondono");
      return;
    }

    if (password.length < 8) {
      setError("La password deve essere almeno 8 caratteri");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/local/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: token, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        // Redirect to home on success
        window.location.href = "/";
      }
    } catch (err) {
      setError("Errore durante la configurazione");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Caricamento...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Errore</CardTitle>
            <CardDescription className="text-red-500">
              {error || "Invito non valido"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Accetta Invito</CardTitle>
          <CardDescription>
            Sei stato invitato come <strong>{inviteData.role}</strong>
            <br />
            Email: <strong>{inviteData.email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === "choice" && (
            <>
              <Button onClick={handleGoogleLogin} className="w-full">
                Continua con Google
              </Button>
              <Button
                onClick={() => setMode("password")}
                variant="outline"
                className="w-full"
              >
                Imposta Password
              </Button>
            </>
          )}

          {mode === "password" && (
            <>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Almeno 8 caratteri"
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
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button
                  onClick={() => setMode("choice")}
                  variant="outline"
                  className="flex-1"
                >
                  Indietro
                </Button>
                <Button
                  onClick={handlePasswordSetup}
                  disabled={submitting}
                  className="flex-1"
                >
                  {submitting ? "Attendere..." : "Conferma"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
