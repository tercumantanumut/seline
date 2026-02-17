import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./sqlite-schema";
import { characters } from "./sqlite-character-schema";

export const agentWorkflows = sqliteTable(
  "agent_workflows",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    initiatorId: text("initiator_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
    status: text("status", { enum: ["active", "paused", "archived"] }).default("active").notNull(),
    metadata: text("metadata", { mode: "json" }).default("{}").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    userStatusIdx: index("idx_agent_workflows_user_status").on(table.userId, table.status),
    initiatorIdx: index("idx_agent_workflows_initiator").on(table.initiatorId),
  })
);

export const agentWorkflowMembers = sqliteTable(
  "agent_workflow_members",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workflowId: text("workflow_id")
      .references(() => agentWorkflows.id, { onDelete: "cascade" })
      .notNull(),
    agentId: text("agent_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role", { enum: ["initiator", "subagent"] }).notNull(),
    sourcePath: text("source_path"),
    metadataSeed: text("metadata_seed", { mode: "json" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`).notNull(),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`).notNull(),
  },
  (table) => ({
    workflowAgentUnique: uniqueIndex("idx_agent_workflow_members_workflow_agent").on(
      table.workflowId,
      table.agentId
    ),
    agentIdx: index("idx_agent_workflow_members_agent").on(table.agentId),
    workflowRoleIdx: index("idx_agent_workflow_members_workflow_role").on(table.workflowId, table.role),
  })
);

export const agentWorkflowsRelations = relations(agentWorkflows, ({ one, many }) => ({
  user: one(users, {
    fields: [agentWorkflows.userId],
    references: [users.id],
  }),
  initiator: one(characters, {
    fields: [agentWorkflows.initiatorId],
    references: [characters.id],
  }),
  members: many(agentWorkflowMembers),
}));

export const agentWorkflowMembersRelations = relations(agentWorkflowMembers, ({ one }) => ({
  workflow: one(agentWorkflows, {
    fields: [agentWorkflowMembers.workflowId],
    references: [agentWorkflows.id],
  }),
  agent: one(characters, {
    fields: [agentWorkflowMembers.agentId],
    references: [characters.id],
  }),
}));

export type AgentWorkflowRow = typeof agentWorkflows.$inferSelect;
export type NewAgentWorkflowRow = typeof agentWorkflows.$inferInsert;
export type AgentWorkflowMemberRow = typeof agentWorkflowMembers.$inferSelect;
export type NewAgentWorkflowMemberRow = typeof agentWorkflowMembers.$inferInsert;
