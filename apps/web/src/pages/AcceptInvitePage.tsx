import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useValidateInvite, useSetup } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Loader2, Mail, Shield, UserIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const passwordFormSchema = z
  .object({
    name: z
      .string()
      .min(2, "Il nome deve avere almeno 2 caratteri.")
      .max(64, "Il nome deve avere al massimo 64 caratteri."),
    password: z
      .string()
      .min(8, "La password deve avere almeno 8 caratteri.")
      .max(128, "La password deve avere al massimo 128 caratteri."),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Le password non corrispondono.",
    path: ["passwordConfirm"],
  });

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [mode, setMode] = useState<"choice" | "password">("choice");

  const inviteQuery = useValidateInvite(token);
  const setup = useSetup();

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      name: "",
      password: "",
      passwordConfirm: "",
    },
    mode: "onTouched",
  });

  const handleGoogleLogin = () => {
    window.location.href = `/api/auth/google/start?inviteToken=${token}`;
  };

  function onSubmit(data: PasswordFormValues) {
    setup.mutate(
      { inviteToken: token!, password: data.password, name: data.name.trim() },
      {
        onSuccess: () => {
          navigate("/dashboard");
        },
      },
    );
  }

  const roleLabel = inviteQuery.data?.role === "admin" ? "Amministratore" : "Operatore";

  // Loading state
  if (inviteQuery.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <CardTitle className="mt-2">Verifica invito...</CardTitle>
            <CardDescription>Stiamo verificando il tuo invito</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Error or missing token
  if (!token || inviteQuery.isError || !inviteQuery.data) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Invito non valido</CardTitle>
            <CardDescription className="text-destructive">
              {!token
                ? "Il link non contiene un token di invito."
                : inviteQuery.error?.message ?? "L'invito non è valido o è scaduto."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const inviteData = inviteQuery.data;

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Accetta Invito</CardTitle>
          <CardDescription>
            Sei stato invitato a unirti a WattGuard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invite summary */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium">{inviteData.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {inviteData.role === "admin" ? (
                <Shield className="h-4 w-4 text-muted-foreground" />
              ) : (
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Ruolo:</span>
              <Badge variant={inviteData.role === "admin" ? "default" : "secondary"}>
                {roleLabel}
              </Badge>
            </div>
          </div>

          {mode === "choice" && (
            <FieldGroup>
              <Button onClick={handleGoogleLogin} variant="outline" className="w-full">
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
                Continua con Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">oppure</span>
                </div>
              </div>

              <Button onClick={() => setMode("password")} className="w-full">
                Crea account con password
              </Button>
            </FieldGroup>
          )}

          {mode === "password" && (
            <form
              id="accept-invite-form"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="accept-invite-name">
                        Nome Completo
                      </FieldLabel>
                      <Input
                        {...field}
                        id="accept-invite-name"
                        aria-invalid={fieldState.invalid}
                        placeholder="Mario Rossi"
                        autoComplete="name"
                        disabled={setup.isPending}
                      />
                      <FieldDescription>
                        Il tuo nome come verrà visualizzato nel sistema.
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="accept-invite-password">
                        Password
                      </FieldLabel>
                      <Input
                        {...field}
                        id="accept-invite-password"
                        type="password"
                        aria-invalid={fieldState.invalid}
                        placeholder="Almeno 8 caratteri"
                        autoComplete="new-password"
                        disabled={setup.isPending}
                      />
                      <FieldDescription>
                        Scegli una password sicura di almeno 8 caratteri.
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="passwordConfirm"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="accept-invite-password-confirm">
                        Conferma Password
                      </FieldLabel>
                      <Input
                        {...field}
                        id="accept-invite-password-confirm"
                        type="password"
                        aria-invalid={fieldState.invalid}
                        placeholder="Ripeti la password"
                        autoComplete="new-password"
                        disabled={setup.isPending}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                {setup.error && (
                  <div role="alert" className="text-sm font-medium text-destructive">
                    {setup.error.message}
                  </div>
                )}
              </FieldGroup>
            </form>
          )}
        </CardContent>

        {mode === "password" && (
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode("choice");
                form.reset();
              }}
              disabled={setup.isPending}
            >
              Indietro
            </Button>
            <Button
              type="submit"
              form="accept-invite-form"
              disabled={setup.isPending}
            >
              {setup.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creazione account...
                </>
              ) : (
                "Crea Account"
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

export default AcceptInvitePage;
