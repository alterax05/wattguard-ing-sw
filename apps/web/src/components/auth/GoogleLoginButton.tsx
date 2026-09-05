import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { useGoogleLogin, useGoogleAuthConfig, useSetup } from "@/hooks/use-auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              logo_alignment?: "left" | "center";
              width?: number | string;
              locale?: string;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function loadGsiScript(onLoad: () => void) {
  if (window.google?.accounts?.id) {
    onLoad();
    return;
  }

  const scriptId = "google-gsi-client";
  const existingScript = document.querySelector<HTMLScriptElement>(`#${scriptId}`);
  if (existingScript) {
    existingScript.addEventListener("load", onLoad);
    return;
  }

  const script = document.createElement("script");
  script.id = scriptId;
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = onLoad;
  document.head.appendChild(script);
}

interface GoogleLoginButtonProps {
  inviteToken?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
  className?: string;
}

export function GoogleLoginButton({
  inviteToken,
  onSuccess,
  onError,
  text = "continue_with",
  className,
}: GoogleLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const { data: config } = useGoogleAuthConfig();
  const googleLogin = useGoogleLogin();
  const setup = useSetup();
  const [scriptLoaded, setScriptLoaded] = useState(
    Boolean(window.google?.accounts?.id)
  );

  const clientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    config?.clientId;

  const handleSuccess = useCallback(() => {
    onSuccess?.();
  }, [onSuccess]);

  const handleError = useCallback((errMessage: string) => {
    onError?.(errMessage);
  }, [onError]);

  useEffect(() => {
    loadGsiScript(() => {
      setScriptLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !clientId || !containerRef.current || !window.google?.accounts?.id) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            if (inviteToken) {
              setup.mutate(
                { token: inviteToken, idToken: response.credential },
                {
                  onSuccess: () => {
                    handleSuccess();
                  },
                  onError: (err) => {
                    handleError(err.message);
                  },
                }
              );
            } else {
              googleLogin.mutate(
                { idToken: response.credential },
                {
                  onSuccess: () => {
                    handleSuccess();
                  },
                  onError: (err) => {
                    handleError(err.message);
                  },
                }
              );
            }
          }
        },
      });

      containerRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: resolvedTheme === "dark" ? "filled_black" : "outline",
        size: "large",
        text,
        width: 380,
        logo_alignment: "left",
      });

      if (!inviteToken) {
        window.google.accounts.id.prompt();
      }
    } catch (e) {
      console.error("Failed to initialize Google Sign-In button:", e);
    }
  }, [scriptLoaded, clientId, resolvedTheme, inviteToken, text, googleLogin, setup, handleSuccess, handleError]);

  if (!clientId) {
    return null;
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="flex justify-center w-full min-h-[40px]" />
      {(googleLogin.error || setup.error) && (
        <p className="text-sm text-destructive text-center mt-2">
          {googleLogin.error?.message || setup.error?.message}
        </p>
      )}
    </div>
  );
}

export default GoogleLoginButton;
