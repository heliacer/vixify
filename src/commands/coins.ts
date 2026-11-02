import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  Colors,
  CommandInteraction,
  EmbedBuilder,
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
import { levelBadge, levelFromXp } from '../helpers/level.js'

// Shared by ?coins and /coins
function profile(target: User | GuildMember, guildId: string) {
  const member = db
    .select({ xp: members.xp, currency: members.currency })
    .from(members)
    .where(and(eq(members.userId, target.id), eq(members.guildId, guildId)))
    .get()

  const { xp = 0, currency = 0 } = member ?? {}
  const { level, xp: into, next } = levelFromXp(xp)
  const { name, namePlural, emoji } = config.currency
  const filled = Math.floor((into / next) * 10)
  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL() })
    .setDescription(
      `${config.rank.label} \`${level}\` ${currency === 1 ? name : namePlural} \`${currency.toLocaleString('de-CH')} ${emoji}\`\n` +
        `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} \`${into}/${next}\` XP`
    )
    .setThumbnail('attachment://level.png')

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(levelBadge(xp), { name: 'level.png' })]
  }
}

@Discord()
export class Coins {
  @Slash({
    name: 'coins',
    description: 'Count your coins before we do',
    contexts: [InteractionContextType.Guild]
  })
  async slash(
    @SlashOption({
      name: 'user',
      description: 'Whose net worth to audit',
      required: false,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      profile(user ?? interaction.user, interaction.guildId)
    )
  }

  @SimpleCommand({ name: 'coins' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply({
      ...profile(user ?? message.author, message.guildId),
      allowedMentions: { repliedUser: false }
    })
  }
}
