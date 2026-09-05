import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useValidateInvite, useSetup } from "@/hooks/use-auth";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
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
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Loader2, Mail, Shield, UserIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

export function AcceptInvitePage() {
  const { t } = useTranslation();

  const passwordFormSchema = z
    .object({
      name: z
        .string()
        .min(2, t("auth.validationNameMin"))
        .max(64, t("auth.validationNameMax")),
      password: z
        .string()
        .min(8, t("auth.validationPasswordMin"))
        .max(128, t("auth.validationPasswordMax")),
      passwordConfirm: z.string(),
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: t("auth.passwordMismatch"),
      path: ["passwordConfirm"],
    });

  type PasswordFormValues = z.infer<typeof passwordFormSchema>;

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

  function onSubmit(data: PasswordFormValues) {
    setup.mutate(
      { id: inviteQuery.data!._id, token: token!, password: data.password, name: data.name.trim() },
      {
        onSuccess: () => {
          void navigate("/dashboard");
        },
      },
    );
  }

  const roleLabel =
    inviteQuery.data?.role === "admin" ? t("users.role.admin") : t("users.role.operator");

  // Loading state
  if (inviteQuery.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <CardTitle className="mt-2">{t("auth.verifyingInvite")}</CardTitle>
            <CardDescription>{t("auth.verifyingInviteDescription")}</CardDescription>
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
            <CardTitle>{t("auth.invalidInvite")}</CardTitle>
            <CardDescription className="text-destructive">
              {!token
                ? t("auth.inviteTokenMissing")
                : inviteQuery.error?.message ?? t("auth.inviteInvalidOrExpired")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const inviteData = inviteQuery.data;

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ModeToggle />
        <LanguageToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t("auth.acceptInviteTitle")}</CardTitle>
          <CardDescription>
            {t("auth.acceptInviteSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invite summary */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("auth.email")}:</span>
              <span className="font-medium">{inviteData.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {inviteData.role === "admin" ? (
                <Shield className="h-4 w-4 text-muted-foreground" />
              ) : (
                <UserIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">{t("common.role")}:</span>
              <Badge variant={inviteData.role === "admin" ? "default" : "secondary"}>
                {roleLabel}
              </Badge>
            </div>
          </div>

          {mode === "choice" && (
            <FieldGroup>
              <GoogleLoginButton
                inviteToken={token}
                inviteId={inviteData._id}
                onSuccess={() => {
                  void navigate("/dashboard");
                }}
              />

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t("common.or")}</span>
                </div>
              </div>

              <Button onClick={() => { setMode("password") }} className="w-full">
                {t("auth.createAccountWithPassword")}
              </Button>
            </FieldGroup>
          )}

          {mode === "password" && (
            <form
              id="accept-invite-form"
              onSubmit={(e) => {
                void form.handleSubmit(onSubmit)(e);
              }}
            >
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="accept-invite-name">
                        {t("auth.name")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="accept-invite-name"
                        aria-invalid={fieldState.invalid}
                        placeholder={t("auth.namePlaceholder")}
                        autoComplete="name"
                        disabled={setup.isPending}
                      />
                      <FieldDescription>
                        {t("auth.nameDescription")}
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
                        {t("auth.password")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="accept-invite-password"
                        type="password"
                        aria-invalid={fieldState.invalid}
                        placeholder={t("auth.passwordMinLength")}
                        autoComplete="new-password"
                        disabled={setup.isPending}
                      />
                      <FieldDescription>
                        {t("auth.passwordDescription")}
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
                        {t("auth.confirmPassword")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="accept-invite-password-confirm"
                        type="password"
                        aria-invalid={fieldState.invalid}
                        placeholder={t("auth.confirmPasswordPlaceholder")}
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
              {t("common.back")}
            </Button>
            <Button
              type="submit"
              form="accept-invite-form"
              disabled={setup.isPending}
            >
              {setup.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("auth.creatingAccount")}
                </>
              ) : (
                t("auth.createAccount")
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

export default AcceptInvitePage;
