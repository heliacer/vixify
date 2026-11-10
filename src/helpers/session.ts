import { eq } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'
import { add, formatCoins } from './economy.js'

export type Session = typeof sessions.$inferSelect

export const sessionTime = 120_000

export const save = (
  id: number,
  state: unknown,
  deadline = Date.now() + sessionTime
) =>
  db.update(sessions).set({ state, deadline }).where(eq(sessions.id, id)).run()

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

export function verdict(
  { id, stake, hostId, guestId }: Session,
  reason: string,
  winner?: string
) {
  if (!stake) {
    settle(id, {})
    return winner ? `## <@${winner}> wins\n${reason}` : `## draw\n${reason}`
  }

  const pot = stake * 2
  const cut = Math.floor((pot * config.houseCut) / 100)
  settle(
    id,
    winner ? { [winner]: pot - cut } : { [hostId]: stake, [guestId!]: stake }
  )
  return winner
    ? `## <@${winner}> takes \`${formatCoins(pot - cut)}\`\n${reason}\n` +
        `-# the house kept ${formatCoins(cut)}`
    : `## draw\n${reason}. \`${formatCoins(stake)}\` went back to each`
}
