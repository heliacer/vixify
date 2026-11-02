import type { ArgsOf } from 'discordx'
import { Discord, On } from 'discordx'
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'
import { levelFromXp } from '../helpers/level.js'

// Last XP reward per guild member, XP is granted at most once a minute
const lastXp = new Map<string, number>()

@Discord()
export class ActivityMonitor {
  @On()
  messageCreate([message]: ArgsOf<'messageCreate'>): void {
    if (!message.inGuild() || message.author.bot) return

    const contentLength = Math.min(message.content.length, 200)
    const currency = Math.floor(
      message.member?.premiumSince ? contentLength / 7.5 : contentLength / 10
    )

    // Random 15-25 XP, so every message is a small gamble
    const key = `${message.guildId}:${message.author.id}`
    const now = Date.now()
    const xp =
      now - (lastXp.get(key) ?? 0) >= 60_000
        ? 15 + Math.floor(Math.random() * 11)
        : 0
    if (xp) lastXp.set(key, now)
    else if (currency === 0) return

    // Single atomic upsert, no read-modify-write
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
      message
        .reply({
          content: `✦ Level \`${level}\``,
          allowedMentions: { repliedUser: false }
        })
        .catch(console.error)
    }
  }
}
