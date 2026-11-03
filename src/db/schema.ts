import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
