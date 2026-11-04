import { and, eq, gte, sql } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'

const member = (userId: string, guildId: string) =>
  and(eq(members.userId, userId), eq(members.guildId, guildId))

export const balance = (userId: string, guildId: string) =>
  db
    .select({ currency: members.currency })
    .from(members)
    .where(member(userId, guildId))
    .get()?.currency ?? 0

export const add = (userId: string, guildId: string, amount: number) =>
  db
    .update(members)
    .set({ currency: sql`${members.currency} + ${amount}` })
    .where(member(userId, guildId))
    .run()

export const take = (userId: string, guildId: string, amount: number) =>
  db
    .update(members)
    .set({ currency: sql`${members.currency} - ${amount}` })
    .where(and(member(userId, guildId), gte(members.currency, amount)))
    .run().changes === 1

export const formatCoins = (amount: number) =>
  `${amount.toLocaleString('de-CH')} ${config.currency.emoji}`
