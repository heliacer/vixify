import {
  ApplicationCommandOptionType,
  CommandInteraction,
  GuildMember,
  InteractionContextType,
  User
} from 'discord.js'
import {
  Discord,
  SimpleCommand,
  SimpleCommandMessage,
  SimpleCommandOption,
  SimpleCommandOptionType,
  Slash,
  SlashOption
} from 'discordx'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'
import getLevelFromXp from '../helpers/levelConverter.js'

// Shared by ?rank and /rank
function standing(target: User | GuildMember, author: User, guildId: string) {
  const member = db
    .select({ xp: members.xp })
    .from(members)
    .where(and(eq(members.userId, target.id), eq(members.guildId, guildId)))
    .get()

  const xp = member?.xp ?? 0
  const text = `rank **${getLevelFromXp(xp)}** · ${xp} XP`
  return target.id === author.id
    ? `You're ${text}`
    : `**${target.displayName}** is ${text}`
}

@Discord()
export class Rank {
  @Slash({
    name: 'rank',
    description: 'How far down the food chain you are',
    contexts: [InteractionContextType.Guild]
  })
  async slash(
    @SlashOption({
      name: 'user',
      description: 'Whose standing to judge',
      required: false,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      standing(user ?? interaction.user, interaction.user, interaction.guildId)
    )
  }

  @SimpleCommand({ name: 'rank' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply({
      content: standing(
        user ?? message.author,
        message.author,
        message.guildId
      ),
      allowedMentions: { repliedUser: false }
    })
  }
}
