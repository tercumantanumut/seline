"use client";

import type { FC } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface GlobalBackButtonProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether to apply Electron-safe webkit-app-region: no-drag */
  isElectron?: boolean;
}

/**
 * Global back button that appears in the header on non-root pages.
 * Uses smart navigation: checks for stored return URL first, then falls back to router.back().
 * This preserves session state when returning from settings.
 */
export const GlobalBackButton: FC<GlobalBackButtonProps> = ({
  className,
  isElectron = false,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  // Hide on root path
  if (pathname === "/") {
    return null;
  }

  const handleBack = (): void => {
    // Prefer navigating back to a stored return URL (when we intentionally want
    // to avoid a popstate restore and force a clean navigation back).
    if (typeof window !== "undefined") {
      const returnUrl = sessionStorage.getItem("seline-return-url");

      if (returnUrl) {
        // Clear first to avoid loops if navigation throws.
        sessionStorage.removeItem("seline-return-url");

        try {
          const url = new URL(returnUrl);
          const target = `${url.pathname}${url.search}${url.hash}`;
          const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

          if (target && target !== current) {
            // Use replace: this is a "Back" affordance and should not add another history entry.
            router.replace(target);
            return;
          }
        } catch {
          // If URL parsing fails, fall through to router.back().
        }
      }
    }

    // Default behavior
    router.back();
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={cn(
        "flex items-center gap-1 text-terminal-dark hover:bg-terminal-dark/10 h-9 px-3",
        isElectron && "webkit-app-region-no-drag",
        className,
      )}
      aria-label={t("goBack")}
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden md:inline">{t("back")}</span>
    </Button>
  );
};
