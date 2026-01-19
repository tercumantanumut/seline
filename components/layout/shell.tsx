"use client";

import type { FC, ReactNode } from "react";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { MenuIcon, XIcon, LogOutIcon, UserIcon, SettingsIcon, InfoIcon, BarChart2Icon, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlobalBackButton } from "@/components/ui/global-back-button";
import { useAuth } from "@/components/auth/auth-provider";
import { WindowsTitleBar } from "@/components/layout/windows-titlebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { animate } from "animejs";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_EASINGS, ZLUTTY_DURATIONS } from "@/lib/animations/utils";
import { getElectronAPI } from "@/lib/electron/types";
import Link from "next/link";
import { useDesktopSidebarState } from "@/hooks/use-desktop-sidebar-state";
import { useTranslations } from "next-intl";
import { DevLogsViewer } from "@/components/dev/dev-logs-viewer";
import { ActiveTasksIndicator } from "@/components/schedules/active-tasks-indicator";

// Context to share sidebar collapsed state with children
interface SidebarContextValue {
  isCollapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isCollapsed: false,
  toggle: () => { },
});

export const useSidebarCollapsed = () => useContext(SidebarContext);

interface ShellProps {
  sidebar?: ReactNode;
  sidebarHeader?: ReactNode;
  children: ReactNode;
  /** Hide navigation (header, sidebar) - used for full-screen experiences like onboarding */
  hideNav?: boolean;
}

export const Shell: FC<ShellProps> = ({ sidebar, sidebarHeader, children, hideNav = false }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [electronPlatform, setElectronPlatform] = useState<string | null>(null);
  const { isCollapsed: desktopCollapsed, toggle: toggleDesktopSidebar, isHydrated } = useDesktopSidebarState();
  const { user, signOut } = useAuth();
  const logoRef = useRef<HTMLDivElement>(null);
  const mobileLogoRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations("layout");

  // Detect Electron environment on client side
  useEffect(() => {
    const electronAPI = getElectronAPI();
    setIsElectronApp(!!electronAPI);
    setElectronPlatform(electronAPI?.platform ?? null);
  }, []);

  // Ambient logo animation
  useEffect(() => {
    if (prefersReducedMotion) return;

    const animateLogo = (ref: React.RefObject<HTMLDivElement | null>) => {
      if (!ref.current) return null;
      return animate(ref.current, {
        rotateY: [-2, 2, -2],
        duration: ZLUTTY_DURATIONS.ambientLoop * 1.5,
        loop: true,
        ease: ZLUTTY_EASINGS.float,
      });
    };

    const anim1 = animateLogo(logoRef);
    const anim2 = animateLogo(mobileLogoRef);

    return () => {
      anim1?.pause();
      anim2?.pause();
    };
  }, [prefersReducedMotion]);

  // Determine if we have a sidebar to show
  const hasSidebar = !!sidebar;
  const isMac = electronPlatform === "darwin";
  const sidebarHeaderContent = sidebarHeader ? (
    <div className={cn("flex items-center gap-2", desktopCollapsed && "md:hidden")}>
      {sidebarHeader}
    </div>
  ) : (
    <div ref={logoRef} className={cn("flex items-center gap-2 transform-gpu", desktopCollapsed && "md:hidden")} style={{ perspective: "500px" }}>
      <span className="text-lg font-bold font-mono text-terminal-green">{t("brandShort")}</span>
      <span className="font-semibold font-mono text-terminal-dark">{t("brand")}</span>
    </div>
  );

  // When hideNav is true, render a minimal shell with just the content
  if (hideNav) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-terminal-cream">
        <WindowsTitleBar />
        <main className="flex-1 overflow-y-auto bg-terminal-cream">{children}</main>
        <DevLogsViewer />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-terminal-cream">
      <WindowsTitleBar />
      {/* Mobile overlay - only when sidebar exists */}
      {hasSidebar && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - only render if sidebar content is provided */}
        {hasSidebar && (
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 transform bg-terminal-cream/80 backdrop-blur-sm transition-all duration-300 ease-in-out md:relative md:translate-x-0 shadow-sm flex flex-col",
              sidebarOpen ? "translate-x-0" : "-translate-x-full",
              // Desktop width based on collapsed state (only apply after hydration to prevent flash)
              isHydrated && desktopCollapsed ? "md:w-16" : "w-72"
            )}
          >
            {/* Header with logo - add top padding for macOS traffic light buttons in Electron */}
            <div
              className={cn(
                "flex h-14 shrink-0 items-center",
                isMac && "mt-8", // Add top margin for macOS traffic light buttons
                desktopCollapsed ? "md:px-2 md:justify-center px-4 justify-between" : "px-4 justify-between"
              )}
            >
              {/* Sidebar header content - hide entirely when collapsed on desktop */}
              {sidebarHeaderContent}
              {/* Mobile close button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-terminal-dark hover:bg-terminal-dark/10"
                onClick={() => setSidebarOpen(false)}
              >
                <XIcon className="size-5" />
              </Button>
              {/* Desktop collapse toggle - centered when collapsed */}
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex text-terminal-muted hover:text-terminal-dark hover:bg-terminal-dark/10"
                onClick={toggleDesktopSidebar}
                title={desktopCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              >
                {desktopCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
            </div>
            {/* Scrollable sidebar content */}
            <div className={cn("flex flex-1 flex-col overflow-hidden min-h-0", desktopCollapsed && "md:hidden")}>
              {sidebar}
            </div>
            {/* User section at bottom of sidebar */}
            {user && (
              <div className={cn(
                "shrink-0 border-t border-terminal-dark/10 bg-terminal-cream/90",
                desktopCollapsed ? "md:p-2" : "p-3"
              )}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "font-mono text-terminal-dark hover:bg-terminal-dark/10",
                        desktopCollapsed ? "md:w-10 md:h-10 md:p-0 md:justify-center w-full justify-start gap-2" : "w-full justify-start gap-2"
                      )}
                    >
                      <UserIcon className="size-4 text-terminal-green flex-shrink-0" />
                      <span className={cn("truncate text-sm", desktopCollapsed && "md:hidden")}>{user.email}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-terminal-cream">
                    <DropdownMenuItem disabled className="font-mono text-terminal-muted">
                      <UserIcon className="mr-2 size-4" />
                      <span className="truncate">{user.email}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-terminal-dark/10" />
                    <DropdownMenuItem asChild className="font-mono text-terminal-dark hover:bg-terminal-dark/5">
                      <Link href="/usage">
                        <BarChart2Icon className="mr-2 size-4" />
                        {t("sidebar.usage")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="font-mono text-terminal-dark hover:bg-terminal-dark/5">
                      <Link href="/settings">
                        <SettingsIcon className="mr-2 size-4" />
                        {t("sidebar.settings")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="font-mono text-terminal-dark hover:bg-terminal-dark/5">
                      <Link href="/about">
                        <InfoIcon className="mr-2 size-4" />
                        {t("sidebar.about")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-terminal-dark/10" />
                    <DropdownMenuItem onClick={signOut} className="font-mono text-red-600 hover:bg-red-50">
                      <LogOutIcon className="mr-2 size-4" />
                      {t("sidebar.signOut")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </aside>
        )}

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header - Three-zone layout: Left (Back), Center (Logo), Right (User Menu) */}
          <header
            className={cn(
              "flex h-14 shrink-0 items-center bg-terminal-cream/90 backdrop-blur-sm px-4 shadow-sm md:h-16 md:px-6",
              hasSidebar ? "md:hidden" : "",
              isElectronApp && "webkit-app-region-drag",
              isMac && "mt-8"
            )}
          >
            <div className="flex w-full items-center justify-between">
              {/* Left zone: Menu button (mobile) + Global Back Button */}
              <div className={cn("flex items-center gap-2 min-w-[80px]", isElectronApp && "webkit-app-region-no-drag")}>
                {hasSidebar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-terminal-dark hover:bg-terminal-dark/10 md:hidden"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <MenuIcon className="size-5" />
                  </Button>
                )}
                <GlobalBackButton isElectron={isElectronApp} />
              </div>

              {/* Center zone: Logo */}
              <div className="flex flex-1 justify-center">
                <Link href="/" aria-label={t("homeAria")} className={cn(isElectronApp && "webkit-app-region-no-drag")}>
                  <div
                    ref={mobileLogoRef}
                    className="flex items-center gap-2 transform-gpu cursor-pointer"
                    style={{ perspective: "500px" }}
                    role="img"
                    aria-label={t("brand")}
                  >
                    <span className="text-xl font-bold font-mono text-terminal-green">{t("brandShort")}</span>
                    <span className="text-lg font-semibold font-mono text-terminal-dark hidden sm:inline">{t("brand")}</span>
                  </div>
                </Link>
              </div>

              {/* Right zone: User menu */}
              <div className={cn("flex items-center justify-end gap-2 min-w-[80px]", isElectronApp && "webkit-app-region-no-drag")}>
                {/* Active Tasks Indicator */}
                <ActiveTasksIndicator />

                {user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-terminal-dark hover:bg-terminal-dark/10">
                        <UserIcon className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-terminal-cream">
                      <DropdownMenuItem disabled className="font-mono text-terminal-muted">
                        <span className="truncate">{user.email}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-terminal-dark/10" />
                      <DropdownMenuItem asChild className="font-mono text-terminal-dark hover:bg-terminal-dark/5">
                        <Link href="/usage">
                          <BarChart2Icon className="mr-2 size-4" />
                          {t("sidebar.usage")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="font-mono text-terminal-dark hover:bg-terminal-dark/5">
                        <Link href="/settings">
                          <SettingsIcon className="mr-2 size-4" />
                          {t("sidebar.settings")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="font-mono text-terminal-dark hover:bg-terminal-dark/5">
                        <Link href="/about">
                          <InfoIcon className="mr-2 size-4" />
                          {t("sidebar.about")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-terminal-dark/10" />
                      <DropdownMenuItem onClick={signOut} className="font-mono text-red-600 hover:bg-red-50">
                        <LogOutIcon className="mr-2 size-4" />
                        {t("sidebar.signOut")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-terminal-cream">{children}</main>
        </div>
      </div>

      {/* Dev Logs Viewer - only shows in Electron */}
      <DevLogsViewer />
    </div>
  );
};
