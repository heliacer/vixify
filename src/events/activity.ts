import type { ArgsOf } from 'discordx'
import { Discord, On } from 'discordx'
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'
import getLevelFromXp from '../helpers/levelConverter.js'

@Discord()
export class ActivityMonitor {
  @On()
  messageCreate([message]: ArgsOf<'messageCreate'>): void {
    if (!message.inGuild() || message.author.bot) return

    const contentLength = Math.min(message.content.length, 200)
    const xp = Math.floor(contentLength / 4)
    const currency = Math.floor(
      message.member?.premiumSince ? contentLength / 7.5 : contentLength / 10
    )
    if (xp === 0) return

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

    const rank = getLevelFromXp(member.xp)
    if (rank > getLevelFromXp(member.xp - xp)) {
      console.log(`${message.author.username} is now rank ${rank}`)
    }
  }
}
