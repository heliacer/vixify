import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'
import { add } from './economy.js'

export type Session = typeof sessions.$inferSelect

export const settle = (id: number, pay: Record<string, number>) =>
  db.transaction(() => {
    const session = db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning()
      .get()
    if (!session) return
    for (const [userId, coins] of Object.entries(pay))
      add(userId, session.guildId, coins)
  })
