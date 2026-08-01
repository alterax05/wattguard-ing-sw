import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/dashboard/theme-provider";
import { AuthProvider } from "@/lib/auth";
import { App } from "./App";
import "@/styles/fonts.css";
import "@/styles/globals.css";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from "./components/ui/sonner";

const queryClient = new QueryClient();

const elem = document.getElementById("root")!;
const root = createRoot(elem);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <App />
        </AuthProvider>
        <Toaster />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
);
