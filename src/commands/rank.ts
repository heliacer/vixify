import {
  ApplicationCommandOptionType,
  CommandInteraction,
  GuildMember,
  InteractionContextType,
  User
} from 'discord.js'
import { Discord, Slash, SlashOption } from 'discordx'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'
import getLevelFromXp from '../helpers/levelConverter.js'

@Discord()
export class Rank {
  @Slash({
    description: 'Where your class belongs',
    name: 'rank',
    contexts: [InteractionContextType.Guild]
  })
  async rank(
    @SlashOption({
      description: 'user',
      name: 'user',
      required: false,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    const target = user ?? interaction.user
    const member = db
      .select({ xp: members.xp })
      .from(members)
      .where(
        and(
          eq(members.userId, target.id),
          eq(members.guildId, interaction.guildId)
        )
      )
      .get()

    const xp = member?.xp ?? 0
    await interaction.reply(`rank: ${getLevelFromXp(xp)}\nxp: ${xp}`)
  }
}
