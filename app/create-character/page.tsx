import { TerminalWizard } from "@/components/character-creation/terminal-wizard";

export const metadata = {
  title: "Create Agent | Seline",
  description: "Configure a custom AI agent with our cinematic terminal experience",
};

// Authentication is handled by proxy - see proxy.ts
// The middleware redirects unauthenticated users to /login
export default function CreateCharacterPage() {
  return (
    <div className="relative min-h-screen">
      <TerminalWizard />
    </div>
  );
}
