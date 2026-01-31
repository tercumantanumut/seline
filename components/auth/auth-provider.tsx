"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// Local user type for auth
interface LocalUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: LocalUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signOut: async () => { },
  refreshAuth: async () => { },
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/signup"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noUsers, setNoUsers] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const verifyAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/verify");
      const data = await res.json();

      if (data.authenticated && data.user) {
        setUser(data.user);
        setNoUsers(false);

        // Also store in localStorage for fallback
        localStorage.setItem(
          "zlutty-settings",
          JSON.stringify({
            ...JSON.parse(localStorage.getItem("zlutty-settings") || "{}"),
            localUserId: data.user.id,
            localUserEmail: data.user.email,
          })
        );

        return { authenticated: true, noUsers: false };
      }

      setUser(null);
      setNoUsers(Boolean(data.noUsers));
      return { authenticated: false, noUsers: Boolean(data.noUsers) };
    } catch {
      setUser(null);
      setNoUsers(false);
      return { authenticated: false, noUsers: false };
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);

      await verifyAuth();
      setIsLoading(false);
    };

    initAuth();
  }, [verifyAuth, pathname]);

  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = PUBLIC_ROUTES.some((route) =>
      pathname.startsWith(route)
    );

    if (!user) {
      if (noUsers && pathname !== "/signup") {
        router.replace("/signup");
      } else if (!isPublicRoute) {
        router.replace("/login");
      }
      return;
    }

    if (isPublicRoute) {
      router.replace("/");
    }
  }, [isLoading, user, noUsers, pathname, router]);

  // Antigravity background token refresh
  useEffect(() => {
    const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    const triggerRefresh = async () => {
      try {
        await fetch("/api/auth/antigravity/refresh", { method: "POST" });
      } catch (error) {
        console.error("[AntigravityAuth] Background refresh error:", error);
      }
    };

    // Initial check
    triggerRefresh();

    const intervalId = setInterval(triggerRefresh, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors
    }

    setUser(null);

    // Clear localStorage auth data
    try {
      const settings = JSON.parse(
        localStorage.getItem("zlutty-settings") || "{}"
      );
      delete settings.localUserId;
      delete settings.localUserEmail;
      localStorage.setItem("zlutty-settings", JSON.stringify(settings));
    } catch {
      // Ignore localStorage errors
    }

    router.push("/login");
    router.refresh();
  }, [router]);

  const refreshAuth = useCallback(async () => {
    await verifyAuth();
  }, [verifyAuth]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
