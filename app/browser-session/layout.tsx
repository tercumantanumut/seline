export const metadata = {
  title: "Browser Session — Selene",
};

export default function BrowserSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      {children}
    </div>
  );
}
