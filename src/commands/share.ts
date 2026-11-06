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
import { add, formatCoins, take } from '../helpers/economy.js'

function share(
  sender: User,
  target: User | GuildMember,
  amount: number,
  guildId: string
) {
  const coins = `\`${formatCoins(amount)}\``

  const users: string[] = []
  let content: string
  if (sender.id === target.id)
    content = 'sharing with yourself is just counting'
  else if (!take(sender.id, guildId, amount))
    content = `you can't share ${coins} you don't have`
  else {
    add(target.id, guildId, amount)
    users.push(target.id)
    content = `${sender} shared ${coins} with ${target}`
  }

  return { content, allowedMentions: { users, repliedUser: false } }
}

@Discord()
export class Share {
  @Slash({
    name: 'share',
    description: 'Part with your coins willingly, for once',
    contexts: [InteractionContextType.Guild]
  })
  async slash(
    @SlashOption({
      name: 'user',
      description: 'Who gets your charity',
      required: true,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember,
    @SlashOption({
      name: 'amount',
      description: 'How much you can live without',
      required: true,
      type: ApplicationCommandOptionType.Integer,
      minValue: 1
    })
    amount: number,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      share(interaction.user, user, amount, interaction.guildId)
    )
  }

  @SimpleCommand({ name: 'share' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    @SimpleCommandOption({
      name: 'amount',
      type: SimpleCommandOptionType.Number
    })
    amount: number,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply(
      user && Number.isInteger(amount) && amount > 0
        ? share(message.author, user, amount, message.guildId)
        : {
            content: 'usage: ?share @user 100',
            allowedMentions: { repliedUser: false }
          }
    )
  }
}
