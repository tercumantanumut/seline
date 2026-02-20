# Seline UX Overhaul — 2026-02-19

## Origin
This plan comes directly from a product review meeting between Umut and Duhan on 2026-02-19. Full transcript analyzed and converted into actionable engineering + design specs.

## Core Theme
> Seline has all the right building blocks. The problem is presentation: too many steps, too many icons, too many pages where users shouldn't need to be. Every change here moves toward **one sentence → chatting** as the ideal new user experience.

---

## Documents in This Folder

| File | What It Covers |
|------|----------------|
| `01-create-agent-modal.md` | Replace full-page wizard entry with inline popup modal |
| `02-wizard-simplification.md` | Remove Knowledge step, make embeddings optional, merge Preview+Success |
| `03-default-tools.md` | Pre-select all utility tools so agents work out of the box |
| `04-agent-card-cleanup.md` | Replace 5-6 icon buttons with a `•••` overflow menu |
| `05-agent-duplicate.md` | New duplicate/copy agent feature (API + UI) |
| `06-workflow-sections.md` | Section headers for Workflows vs Agents, quick add to workflow |
| `07-slash-skill-picker.md` | Type `/` in chat input to browse and invoke skills |
| `08-deferred.md` | Things we discussed but are intentionally not doing yet |
| `09-launch-marketing-plan.md` | Full launch plan, platforms, content calendar, work distribution |

---

## Priority Order for Implementation

```
1. Create Agent Modal          (highest user-facing impact, new users hit this first)
2. Wizard Simplification       (removes friction in advanced wizard path)
3. Default Tools               (one-line fix, huge value — agents work immediately)
4. Agent Card Cleanup          (reduces visual noise on home screen)
5. Agent Duplicate             (new API + UI, needed for workflow reuse)
6. Workflow Sections           (low effort, high clarity improvement)
7. Slash Skill Picker          (additive, no regressions, great power-user feature)
```

---

## Non-Goals (Explicitly Deferred)
- Full node-graph workflow editor (ComfyUI-style)
- Plugin marketplace content (curating 300-500 plugins from the web)
- Agent-driven onboarding (LLM auto-picks tools from user description)
- Unified per-agent settings hub (skills + plugins + memory in one tabbed page)
- Removing the full `/create-character` wizard (keep for power users, just stop linking to it by default)
