import type { CharacterDisplayPrompt } from "@/components/assistant-ui/character-context";

export function getGroundedQuickStarts(): CharacterDisplayPrompt[] {
  return [
    {
      id: "quickstart-competitor-radar",
      lane: "hard",
      title: "Competitor radar",
      description: "Daily tracking with risk flags and distribution.",
      text: "Set up a daily competitor radar at 09:00 Istanbul for five companies. Track launches, pricing changes, and GTM moves; flag risks and opportunities, then deliver to app and Slack.",
      requiresChannels: true,
    },
    {
      id: "quickstart-exec-brief-from-web",
      lane: "hard",
      title: "Exec market brief",
      description: "Sector scan with pricing and scale signals.",
      text: "Create a weekly executive market brief for a chosen SaaS sector: identify emerging players, compare feature and pricing shifts, estimate scale signals, and produce a concise report with watchlist recommendations.",
    },
    {
      id: "quickstart-codebase-risk-audit",
      lane: "hard",
      title: "Codebase risk audit",
      description: "Auth/session/regression hotspots with fixes.",
      text: "Run a codebase risk audit on this repository. First check if there are any synced files available; if not, guide me through syncing the right folders before starting. Once files are available, identify auth, session, and regression hotspots with severity, file references, and a practical patch plan.",
      requiresSyncFolder: true,
    },
    {
      id: "quickstart-launch-readiness",
      lane: "hard",
      title: "Launch readiness",
      description: "Checklist, scoring, and go/no-go memo.",
      text: "Build a launch readiness command center for an upcoming release: checklist by owner, risk score rubric, go/no-go memo template, and reminder cadence for execution.",
    },
    {
      id: "quickstart-meeting-to-execution",
      lane: "simple",
      title: "Meeting to execution",
      description: "Decisions into owners, deadlines, follow-ups.",
      text: "Turn this meeting transcript into execution: decisions, owners, due dates, dependencies, and recurring follow-up reminders.",
    },
    {
      id: "quickstart-memorize-style",
      lane: "simple",
      title: "Memorize my style",
      description: "Persist your communication preferences.",
      text: "Memorize my working style for future chats: concise responses, risk-first reasoning, and clear next actions.",
    },
    {
      id: "quickstart-first-skill",
      lane: "simple",
      title: "Create first skill",
      description: "Build reusable workflow from one task.",
      text: "Help me create my first reusable skill. Start by asking me what specific task or workflow I repeat often that I'd like to automate. Once I describe it, shape the skill collaboratively, then store it with clear trigger examples and show how to retrieve it with getSkill in future chats.",
    },
    {
      id: "quickstart-empty-repo-plan",
      lane: "simple",
      title: "Start from zero",
      description: "No files yet? Generate a practical setup plan.",
      text: "I have no synced folders yet. Propose a practical workspace bootstrap plan for this project: folders to create, what to sync first, and the first three high-value analyses to run after sync.",
      hideWhenHasSyncFolder: true,
    },
  ];
}
