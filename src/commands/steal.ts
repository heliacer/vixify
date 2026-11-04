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
import config from '../config.js'
import { db } from '../db/index.js'
import { add, balance } from '../helpers/economy.js'

const caughtAt = new Map<string, number>()

function steal(thief: User, target: User | GuildMember, guildId: string) {
  const key = `${guildId}:${thief.id}`
  const held = balance(target.id, guildId)
  const amount = held && Math.max(1, Math.floor(held * 0.1))
  const coins = `\`${amount.toLocaleString('de-CH')} ${config.currency.emoji}\``

  const users: string[] = []
  let content: string
  if (Date.now() - (caughtAt.get(key) ?? 0) < 60_000)
    content = 'the house saw your steal. sit the next minute out'
  else if (!amount) content = `${target} has nothing to steal`
  else if (balance(thief.id, guildId) < amount)
    content = `you need ${coins} to risk stealing from ${target}`
  else {
    const caught = Math.random() >= 0.6
    const [from, to] = caught ? [thief.id, target.id] : [target.id, thief.id]
    db.transaction(() => {
      add(from, guildId, -amount)
      add(to, guildId, amount)
    })
    if (caught) caughtAt.set(key, Date.now())
    users.push(target.id)
    content = caught
      ? `you got caught stealing 🤣💀\n${target} gets ${coins} instead`
      : `stole ${coins} from ${target}`
  }

  return { content, allowedMentions: { users, repliedUser: false } }
}

@Discord()
export class Steal {
  @Slash({
    name: 'steal',
    description: 'Take 10% of their coins, or pay up trying',
    contexts: [InteractionContextType.Guild]
  })
  async slash(
    @SlashOption({
      name: 'user',
      description: 'Who to rob',
      required: true,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(steal(interaction.user, user, interaction.guildId))
  }

  @SimpleCommand({ name: 'steal' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply(
      user
        ? steal(message.author, user, message.guildId)
        : 'usage: ?steal @user'
    )
  }
}
