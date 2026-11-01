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
import config from '../config.js'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'

// Shared by ?eds and /eds
function balance(target: User | GuildMember, author: User, guildId: string) {
  const member = db
    .select({ currency: members.currency })
    .from(members)
    .where(and(eq(members.userId, target.id), eq(members.guildId, guildId)))
    .get()

  const amount = member?.currency ?? 0
  const { name, namePlural, emoji } = config.currency
  const text = `${emoji} **${amount}** ${amount === 1 ? name : namePlural}`
  return target.id === author.id
    ? text
    : `**${target.displayName}** has ${text}`
}

@Discord()
export class Eds {
  @Slash({
    name: 'eds',
    description: 'How the world sees your worth',
    contexts: [InteractionContextType.Guild]
  })
  async slash(
    @SlashOption({
      name: 'user',
      description: 'user',
      required: false,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      balance(user ?? interaction.user, interaction.user, interaction.guildId)
    )
  }

  @SimpleCommand({ name: 'eds' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply({
      content: balance(user ?? message.author, message.author, message.guildId),
      allowedMentions: { repliedUser: false }
    })
  }
}
