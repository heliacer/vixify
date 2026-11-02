import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// One row per user per guild. Level is derived from xp, see helpers/level.ts
export const members = sqliteTable(
  'members',
  {
    userId: text().notNull(),
    guildId: text().notNull(),
    xp: integer().notNull().default(0),
    currency: integer().notNull().default(0)
  },
  t => [primaryKey({ columns: [t.userId, t.guildId] })]
)
