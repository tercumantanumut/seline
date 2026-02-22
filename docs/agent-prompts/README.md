# Seline Agent Prompts

Specialist agent prompt templates for the Seline platform. Each agent has a focused role, constrained tool access, and platform-aware instructions.

## Agents

| Agent | File | Tools | Purpose |
|-------|------|-------|---------|
| **Explore** | [explore.md](explore.md) | localGrep, vectorSearch, readFile, executeCommand (ro) | Fast codebase and knowledge base search |
| **Plan** | [plan.md](plan.md) | localGrep, vectorSearch, readFile, executeCommand (ro) | Architecture analysis and implementation planning |
| **Command Executor** | [bash-command-specialist.md](bash-command-specialist.md) | executeCommand | Safe shell execution within synced folders |
| **General Purpose** | [general-purpose.md](general-purpose.md) | All | Multi-step task execution with full tool access |
| **Platform Guide** | [platform-guide.md](platform-guide.md) | localGrep, vectorSearch, readFile, webSearch | Seline features, config, and troubleshooting |
| **Conversation Summarizer** | [conversation-summarizer.md](conversation-summarizer.md) | readFile | Session compaction summaries |
| **Session Search** | [session-search.md](session-search.md) | searchSessions, readFile | Find relevant sessions from chat history |
| **Hook Verifier** | [agent-hook-verifier.md](agent-hook-verifier.md) | localGrep, readFile, executeCommand (ro) | Verify task completion for plugin hooks |
| **Agent Architect** | [agent-architect.md](agent-architect.md) | localGrep, vectorSearch, readFile | Design new agents with full platform awareness |
| **Command Description Writer** | [bash-description-writer.md](bash-description-writer.md) | None | Generate UI descriptions for shell commands |
| **Project Onboarder** | [claudemd-creator.md](claudemd-creator.md) | localGrep, vectorSearch, readFile, executeCommand (ro) | Generate project context docs for synced codebases |

## Design Principles

1. **Minimal tool access** — Each agent gets only what it needs
2. **Read-only by default** — Exploration agents cannot modify state
3. **Platform-aware** — Agents understand Seline's tools, plugins, skills, hooks, channels, and workflows
4. **Parallel execution** — Agents spawn parallel tool calls where possible
5. **Knowledge over prompt** — Use synced folders and vector search instead of stuffing the system prompt
