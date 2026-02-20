# 09 — Launch & Marketing Plan

## Overview

Seline launch target: **March 4, 2026 (Tuesday)** — Tuesday is the best Product Hunt day
Team: Umut (engineering + demos), Duhan (content + distribution + user research)

---

## Critical Pre-Launch Blockers (Must Fix Before Launch)

| # | Blocker | Owner | Status |
|---|---------|-------|--------|
| 1 | **CONTRIBUTING.md** — open source projects need this for community building | Umut | Missing |
| 2 | **Landing page** — no place to capture waitlist emails before launch | Umut + Duhan | Missing |
| 3 | **Beta testers** — 10-20 testers before Mar 4 launch | Duhan recruits - Umut helps | Not planned |

---

## Messaging & Positioning

### Primary Target User (Pick ONE for launch)
**Developers who want AI agents that do real work on their machine.**
Business users and power users are secondary audiences — launch with a focused developer message.

### "Runs locally" → Fix the Messaging
The current "Runs locally" claim is inaccurate. Seline stores data locally but requires cloud API keys (Anthropic, OpenRouter, etc.) for LLM calls. Fix to:
- **Correct**: "Local-first — your data, your API keys, your machine"
- **Correct**: "Open source desktop app. Bring your own API keys, pay only for what you use."
- **Avoid**: "Runs locally" / "Your data stays yours" (implies no cloud dependencies)

### Corrected Tagline
Current: "Build AI agents that actually work. Chat, code, research, schedule & automate. Open source. Runs locally."

**Recommended alternatives:**
- "Seline — AI agents that research, code, and message you the results. Open source desktop app." ← workflow angle
- "Seline — Your AI agents, running on your machine. Bring your own API keys." ← ownership angle
- "Seline — The open-source AI desktop app where agents actually ship work." ← developer angle

### Seline's Real Differentiators (Lead With These)
Based on codebase analysis vs. competitors, Seline's unique combination:
1. **Multi-channel bot deployment** — WhatsApp + Telegram + Slack + Discord from a desktop app (no competitor does this)
2. **Deep Research with cited sources** — 6-phase research workflow, Perplexity-quality, free/self-hosted
3. **Task scheduling with channel delivery** — set agent to research overnight, get results in your Telegram at 8 AM
4. **Video assembly** — no other AI agent platform generates videos with Remotion
5. **8 one-click agent templates** — most competitors have zero

### Cost Transparency (Address This Proactively)
Users will immediately ask "what does it cost?" — have an answer ready:
- **Seline itself**: Free (MIT license, open source)
- **API costs**: Typically $5-20/month for moderate usage (Claude API ~$3-15/1M tokens)
- **Ollama**: Free (local models, requires GPU/CPU)

### Updated Comparison Table

| Feature | Seline | Open WebUI | AnythingLLM | Jan.ai | ChatGPT |
|---------|--------|-----------|-------------|--------|---------|
| Persistent agents | ✓ | ✗ | partial | ✗ | ✗ |
| File system access | ✓ | ✗ | ✓ (RAG only) | ✗ | sandbox only |
| Scheduling | ✓ | ✗ | ✗ | ✗ | ✗ |
| Multi-agent workflows | ✓ | ✗ | ✗ | ✗ | ✗ |
| Channel bots (WhatsApp/TG/Slack) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Deep research | ✓ | ✗ | ✗ | ✗ | paid |
| Skills/plugins | ✓ | ✓ | partial | ✗ | ✓ (GPTs) |
| Local LLM (Ollama) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Open source | ✓ | ✓ | ✓ | ✓ | ✗ |
| Desktop app | ✓ | ✗ | ✓ | ✓ | ✓ |
| Video generation | ✓ | ✗ | ✗ | ✗ | ✗ |

Note: Compare against Open WebUI, AnythingLLM, Jan.ai — not ChatGPT/Claude.ai (unfair comparison) or AutoGPT (lost mindshare since 2023).

---

## Phase 1: Pre-Launch Preparation (Feb 19 → Mar 3)

### 1.1 — App Assets (Umut + Duhan together)

**Screenshots needed (6 total):**
| # | Screen | What to Show |
|---|--------|-------------|
| 1 | Home page | Clean agent grid, 3-4 agents, workflow section visible |
| 2 | Chat in action | Agent mid-task, tool calls visible, clean UI |
| 3 | Create Agent Modal | Quick create popup, minimal and fast |
| 4 | Workflow tree | Multi-agent workflow, connection visible |
| 5 | Real estate use case | Duhan's scraper result card output |
| 6 | Settings / tools | Shows extensibility (many tools, clean layout) |

**Demo video (60-90 sec, Umut records):**
```
Script outline:
0-5s   : "Meet Seline — your AI agent platform"
5-20s  : Home screen tour → click Create Agent → type sentence → chatting in 10s
20-35s : Agent doing real work (web search + file edit in chat)
35-50s : Workflow: two agents running in parallel on different tasks
50-65s : Scheduling: agent runs overnight, you check results in the morning
65-75s : "Open source. Free to use. Your agents, your data."
```

**GIFs (Duhan records, 10-15 sec each):**
1. Create agent in 10 seconds (quick create modal)
2. Real estate analyzer output
3. Agent writing code + committing to git
4. Scheduling an agent task
5. *(New)* Agent delivering research results to Telegram/WhatsApp

**Short-form videos (15-30 sec "wow moment" clips — Umut records, Duhan distributes):**
- Agent creating a PR
- Scheduling a task in 10 seconds
- Agent researching and delivering to WhatsApp at 8 AM
- Post to YouTube Shorts, TikTok, Instagram Reels, X simultaneously

### 1.2 — App Description Copy (Duhan drafts, Umut reviews)

**Short description (300 words):**
```
Seline is an open-source AI agent platform that lets you build, customize, and run AI agents
for any task — on your own machine, with your own API keys.

Unlike cloud-based tools, Seline agents persist. They remember conversations, execute real
tasks on your computer, browse the web, manage files, run schedules, and work in multi-agent
teams. And they can message you results on WhatsApp, Telegram, or Slack.

Key capabilities:
• Chat with any LLM (Claude, GPT-4, local models via Ollama)
• Agents that read/write files, run code, and search the web
• Multi-channel bots: deploy an agent to WhatsApp, Telegram, or Slack
• Deep research: 6-phase research with cited sources (Perplexity-style, free)
• Schedule agents to run overnight and deliver results in the morning
• Multi-agent workflows where agents delegate to each other
• Build and share skills (custom mini-programs) to extend agent abilities
• Developer Workspace: agents work on git branches, submit PRs
• 8 ready-made templates: Social Media Manager, Data Analyst, Meeting Notes, and more

Built for developers, researchers, and power users who want to automate real work with AI.

Open source (MIT). Desktop app for Mac and Windows. Pay only for API usage — no subscription.
```

### 1.3 — Create Discord Server (Duhan, 2 weeks before launch)

Set up Discord with channels: `#announcements`, `#general`, `#show-your-agent`, `#bug-reports`, `#feature-requests`, `#agent-templates`. This is needed before launch since success metrics include "Discord joins."

### 1.4 — Landing Page with Email Capture (Umut + Duhan, 1 week before launch)

Simple one-page site with email signup to capture 200-500 pre-launch subscribers. These become Day 1 upvoters and stargazers. Even a Carrd.co or Notion page with an email form works.

### 1.5 — Beta Testing (Duhan recruits, Feb 28 → Mar 3)

Recruit 10-20 beta testers. Sources: personal network, X/Twitter, r/LocalLLaMA, AI Discord servers. Focus on: install issues on Mac/Windows, API key config confusion, first-run UX.

### 1.6 — Product Hunt Preparation (Duhan, 2+ weeks before launch)

- Start following/engaging on Product Hunt NOW (30+ days before launch)
- Build maker profiles with follower base
- Pre-launch page with follower capture

---

## Phase 2: Launch Day (March 4, 12:01 AM PST)

**Launch time: 12:01 AM PST** — NOT 6 AM. Product Hunt resets at midnight PST; launching at 12:01 AM gives the full 24-hour window.

### Priority Order

#### Tier 1 — High impact, same day
| Platform | Who | Action |
|----------|-----|--------|
| **Product Hunt** | Duhan runs, Umut reviews copy | Full listing, 12:01 AM PST, maker "first comment" ready |
| **Hacker News (Show HN)** | Umut writes, posts | Technical angle: multi-agent + open source + channel bots |
| **X / Twitter** | Duhan | Thread with demo video + wow-moment clips |
| **GitHub** | Umut | README refresh with screenshots, badges, topics, use cases |

#### Tier 2 — Same week
| Platform | Who | Action |
|----------|-----|--------|
| **Reddit** | Duhan | r/LocalLLaMA, r/SelfHosted, r/MachineLearning, r/SideProject |
| **LinkedIn** | Duhan | Company + personal post with story angle |
| **Discord servers** | Duhan | AI Tinkerers, LocalLLaMA Discord, etc. |

*Note: r/LocalLLaMA requires established account (≥2 weeks activity, <10% self-promotion). Start contributing now.*

#### Tier 3 — Week 2-3
| Platform | Who | Action |
|----------|-----|--------|
| **YouTube** | Duhan (or Umut records) | 5-min walkthrough video |
| **Dev.to / Hashnode** | Umut | Technical writeup: "How I built a multi-agent platform" |
| **Indie Hackers** | Duhan | Share story, use case outcomes |
| **AppSumo** | — | Deprioritize — audience mismatch for developer tool with BYOK model |

### Newsletter Outreach (Duhan, 2 weeks before launch)

Reach out to at least 5 of these with a press kit (screenshots, description, founder story):
- **TLDR** (1.2M+ subscribers) — "cool tools" section
- **Ben's Bites** — AI-specific newsletter
- **The Rundown AI** — daily AI newsletter
- **Console.dev** — curates interesting open-source tools
- **Changelog** — podcast + newsletter, covers open source
- **JavaScript Weekly / Node Weekly** — Seline is Electron/Next.js/Node

### Developer Influencer Outreach (Duhan, 2 weeks before launch)

Specific targets to DM (cold outreach is free):
- **Fireship** (3M+ subs) — covers dev tools in "100 seconds" format
- **Matt Wolfe** — AI tools reviewer
- **All About AI** — covers open-source AI specifically
- **NetworkChuck** — covers self-hosted and local AI
- **Theo (t3.gg)** — covers Next.js/TypeScript ecosystem

### GitHub Trending Strategy (launch day)

- Add repo topics: `ai`, `agent`, `llm`, `desktop-app`, `electron`, `open-source`, `local-ai`, `mcp`, `whatsapp-bot`, `multi-agent`
- Push stars on launch day simultaneously with Product Hunt
- Ask early supporters to star the repo at 12:01 AM

---

## Phase 3: User Acquisition (Ongoing post-launch)

### Daily Commitment
- **Umut**: 10 min/day — respond to comments, DMs, GitHub issues
- **Duhan**: 30 min/day — engage with replies, share use cases, talk to 1 user

### Content Calendar (Duhan owns, Umut reviews)

**Week of launch:**
- Day 1 (launch day): Demo video + Product Hunt + HN + GitHub push
- Day 2: Real estate use case GIF + description
- Day 3: Git worktree parallel agent demo
- Day 4: Scheduling overnight agent use case
- Day 5: "How to build your first agent in 10 seconds"

**Ongoing weekly:**
- 1x use case showcase (video or GIF + description)
- 1x feature highlight (a tool, a capability — especially underrated features)
- 1x short-form wow-moment clip
- 1x response to community question/feedback

### User Research (Duhan)
- Talk to 1 user per day for the first 2 weeks post-launch (10-min call)
- Track: what they tried to do, what was confusing, what delighted them
- Share summary with Umut weekly
- Key question: "What would make you recommend Seline to a friend?"

---

## Phase 4: Budget Allocation

| Category | Suggested Budget | Owner |
|----------|-----------------|-------|
| Apple Developer Program (Mac signing) | $99/year | Umut |
| Product Hunt promotion | $50-100 | Duhan |
| X/Reddit paid ads (only after seeing organic traction) | $100-200 | Duhan |
| Influencer/creator outreach | $0 (cold DMs first) | Duhan |
| Design assets (if freelancer needed) | TBD | Duhan |

**Rule:** No paid ads until organic launch shows traction signal (>100 GitHub stars, >200 PH upvotes). Measure first week, then decide.

---

## Work Distribution Summary

### Umut's Engineering Tasks (In Priority Order)
See docs 01-07 for full implementation specs.
1. **Doc 03** — Export `DEFAULT_ENABLED_TOOLS` from resolve-tools.ts (unblocks doc 01)
2. **Doc 01** — Create Agent Modal (`components/character-creation/create-agent-modal.tsx`)
3. **Doc 02** — Wizard simplification (remove Knowledge step, merge Preview+Success)
4. **Doc 04** — Agent card `•••` overflow menu
5. **Doc 05** — Agent duplicate API + UI
6. **Doc 06** — Home page section headers (Workflows / Agents)
7. **Doc 07** — Slash skill picker in chat input
8. **Mac code signing** — Apple Developer enrollment, sign + notarize

### Umut's Marketing Tasks
- Record 60-90 sec demo video
- Record 5 short-form wow-moment clips (15-30 sec each)
- Record GIFs: worktree agent, scheduling, code agent
- Write HN "Show HN" post copy
- Refresh README with screenshots, topics, CONTRIBUTING.md
- Review all Duhan copy before publishing

### Duhan's Tasks (Parallel with dev)

**Week 1 (Feb 19-24):**
- [ ] Set up Discord server with channels
- [ ] Draft corrected app tagline + description (use updated messaging above)
- [ ] Draft comparison table (vs. Open WebUI, AnythingLLM, Jan.ai — not ChatGPT)
- [ ] Build Product Hunt page draft (screenshots from Umut when ready)
- [ ] Record real estate analyzer demo GIF
- [ ] Compile initial list of 50 plugins for marketplace (in `marketplace.json` format — see doc 08 D2)
- [ ] Create simple landing page with email capture

**Week 2 (Feb 24-Mar 3):**
- [ ] Recruit 10-20 beta testers, run tests
- [ ] Schedule Product Hunt for Mar 4, 12:01 AM PST (not 6 AM)
- [ ] Prepare Reddit posts (different angle per community, establish account first)
- [ ] Write LinkedIn post (personal story angle)
- [ ] Newsletter outreach to 5+ newsletters with press kit
- [ ] DM influencer/YouTuber targets
- [ ] X/Twitter thread draft with embedded demo video
- [ ] Prep "maker first comment" for Product Hunt page

**Launch Day (Mar 4):**
- [ ] Post all content simultaneously at 12:01 AM PST
- [ ] Respond to all comments within 15 minutes
- [ ] Ask supporters to upvote and star on GitHub

**Ongoing:**
- [ ] Talk to 1 potential user per day (10 minutes)
- [ ] Document feedback in shared notes doc
- [ ] Maintain content calendar (3 posts/week)

---

## Timeline

```
Feb 19 (today) → Dev sprint starts + Duhan begins content prep
Feb 24 (Mon)   → Core dev features complete (docs 01-04 done)
Feb 28 (Fri)   → All features + assets ready; beta testers start
Mar 3 (Mon)    → Beta feedback addressed; Product Hunt page finalized
Mar 4 (Tue)    → LAUNCH DAY 12:01 AM PST (NOT 6 AM)
Mar 11         → Week 1 metric review; paid ads decision
```

---

## Success Metrics (First Week)

| Metric | Goal |
|--------|------|
| Product Hunt upvotes | 200+ |
| GitHub stars (new) | 100+ |
| App downloads | 500+ |
| Discord joins | 50+ |
| HN upvotes | 50+ |
| Email signups (pre-launch) | 200+ |
| User interviews | 10+ |
| Waitlist/email conversion to install | >20% |

**Go/No-Go criteria for paid ads:** If GitHub stars < 100 after week 1, revisit messaging before spending on ads.

---

## Gap Analysis & Missing Considerations

> The following were identified by codebase audit and platform research on 2026-02-19 and have been incorporated into the plan above. Kept here for historical reference.

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | "Runs locally" is inaccurate — requires cloud API keys | Messaging corrected throughout |
| 2 | Comparison table has inaccuracies (ChatGPT has desktop app) | Table rebuilt vs. correct competitors |
| 3 | AutoGPT lost mindshare — wrong competitor | Replaced with Open WebUI, AnythingLLM, Jan.ai |
| 4 | Product Hunt 6 AM PST is wrong — should be 12:01 AM PST | Corrected |
| 5 | Mac code signing is launch blocker | Added as Critical Pre-Launch Blocker #1 |
| 6 | No Discord server planned | Added as Phase 1 task |
| 7 | No short-form video strategy | Added wow-moment clips to content plan |
| 8 | No newsletter outreach | Added newsletter list + Duhan task |
| 9 | No influencer outreach list with names | Added specific targets |
| 10 | No GitHub Trending strategy | Added repo topics + star coordination |
| 11 | No beta testing phase | Added beta testing (Feb 28 - Mar 3) |
| 12 | No landing page / email capture | Added as Critical Pre-Launch Blocker #3 |
| 13 | No cost transparency messaging | Added "Seline itself is free" narrative |
| 14 | AppSumo not suitable for BYOK developer tool | Deprioritized with explanation |
| 15 | Seline's unique features undersold | Updated description highlights channels, deep research, video |
| 16 | CONTRIBUTING.md missing for open source | Added as Critical Pre-Launch Blocker #2 |
| 17 | No "Why not just use ChatGPT?" narrative | Added as messaging recommendation |
| 18 | No go/no-go criteria for paid ads | Added metrics gate |
