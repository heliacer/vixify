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

export const sessions = sqliteTable('sessions', {
  id: integer().primaryKey({ autoIncrement: true }),
  game: text().notNull(),
  guildId: text().notNull(),
  channelId: text().notNull(),
  messageId: text().notNull(),
  hostId: text().notNull(),
  guestId: text(),
  stake: integer().notNull(),
  deadline: integer().notNull()
})
