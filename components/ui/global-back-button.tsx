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
    // Check for stored return URL (set when navigating to settings)
    if (typeof window !== 'undefined') {
      const returnUrl = sessionStorage.getItem('seline-return-url');

      if (returnUrl && pathname === '/settings') {
        // Clear the stored URL
        sessionStorage.removeItem('seline-return-url');

        // Parse the URL to get the pathname and search params
        try {
          const url = new URL(returnUrl);
          // Use push with the full path to ensure server component re-runs
          router.push(url.pathname + url.search);
          return;
        } catch {
          // If URL parsing fails, fall through to router.back()
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
        className
      )}
      aria-label={t("goBack")}
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden md:inline">{t("back")}</span>
    </Button>
  );
};

