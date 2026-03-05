import { ThemeProvider } from "@/components/theme/theme-provider";

export const metadata = {
  title: "Browser Session — Seline",
};

export default function BrowserSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider initialTheme="dark">
      <div className="h-screen w-screen overflow-hidden bg-black">
        {children}
      </div>
    </ThemeProvider>
  );
}
