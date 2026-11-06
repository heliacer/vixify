import type { ArgsOf } from 'discordx'
import { Discord, On } from 'discordx'
import { sql } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'
import { levelFromXp } from '../helpers/level.js'

const lastReward = new Map<string, number>()

@Discord()
export class ActivityMonitor {
  @On()
  messageCreate([message]: ArgsOf<'messageCreate'>): void {
    if (!message.inGuild() || message.author.bot) return

    const key = `${message.guildId}:${message.author.id}`
    const now = Date.now()
    if (now - (lastReward.get(key) ?? 0) < 30_000) return
    lastReward.set(key, now)

    const contentLength = Math.min(message.content.length, 200)
    const currency = Math.floor(
      message.member?.premiumSince ? contentLength / 7.5 : contentLength / 10
    )
    const xp = 15 + Math.floor(Math.random() * 11)

    const member = db
      .insert(members)
      .values({
        userId: message.author.id,
        guildId: message.guildId,
        xp,
        currency
      })
      .onConflictDoUpdate({
        target: [members.userId, members.guildId],
        set: {
          xp: sql`${members.xp} + ${xp}`,
          currency: sql`${members.currency} + ${currency}`
        }
      })
      .returning({ xp: members.xp })
      .get()

    const { level } = levelFromXp(member.xp)
    if (level > levelFromXp(member.xp - xp).level) {
      message.channel
        .send(
          `Congrats ${message.author}, you're now ✦ ${config.rank.label} \`${level}\``
        )
        .catch(console.error)
    }
  }
}
