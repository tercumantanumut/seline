# Skills V2 Alertability Matrix

| Metric | Source | Window | Warning | Critical | Action |
|---|---|---|---|---|---|
| `skill_copy_failed / (skill_copy_succeeded + skill_copy_failed)` | `/api/skills/telemetry/alerts` | 24h | > 10% | > 25% | Pause Track B cohort expansion, inspect copy route errors |
| `skill_library_zero_results / skill_library_opened` | `/api/skills/telemetry/alerts` | 24h | > 40% | > 60% | Review search defaults and category coverage |
| `skill_update_stale` count | `/api/skills/telemetry` | 24h | > 20 | > 50 | Investigate optimistic version conflicts and stale editors |
| Dashboard API errors | `/api/dashboard/summary` + server logs | 24h | > 2% | > 5% | Disable Track C if sustained 30m |
| Skill library API errors | `/api/skills?all=true` + server logs | 24h | > 2% | > 5% | Disable `ENABLE_PUBLIC_LIBRARY` until stabilized |

## Rollback toggles

- Track B: `SKILLS_V2_TRACK_B_ENABLED=false`
- Cross-agent copy: `ENABLE_CROSS_AGENT_COPY=false`
- Public library: `ENABLE_PUBLIC_LIBRARY=false`
- Track C dashboard/stats: `SKILLS_V2_TRACK_C_ENABLED=false`
- Track D templates: `SKILLS_V2_TRACK_D_ENABLED=false`
- Track E detail builder: `SKILLS_V2_TRACK_E_ENABLED=false`