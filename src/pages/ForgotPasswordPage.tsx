import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/local/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError("Errore durante la richiesta");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="container mx-auto p-8 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Email inviata</CardTitle>
            <CardDescription>
              Se l'email esiste nel nostro sistema, riceverai un link per reimpostare la password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Controlla la tua casella di posta (e la cartella spam).
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Torna al Login
              </Button>
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
          <CardTitle>Password Dimenticata</CardTitle>
          <CardDescription>
            Inserisci la tua email per ricevere un link di reset
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tua-email@esempio.com"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Invio in corso..." : "Invia Link di Reset"}
            </Button>
            <Link to="/login">
              <Button variant="ghost" className="w-full">
                Torna al Login
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
