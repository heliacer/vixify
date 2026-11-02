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
import { and, eq, sql } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'

const balance = (userId: string, guildId: string) =>
  db
    .select({ currency: members.currency })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.guildId, guildId)))
    .get()?.currency ?? 0

const add = (userId: string, guildId: string, amount: number) =>
  db
    .update(members)
    .set({ currency: sql`${members.currency} + ${amount}` })
    .where(and(eq(members.userId, userId), eq(members.guildId, guildId)))
    .run()

// Last time each guild member got caught, they sit out a minute after
const caughtAt = new Map<string, number>()

// Shared by ?steal and /steal, only an actual steal pings the target
function steal(thief: User, target: User | GuildMember, guildId: string) {
  const key = `${guildId}:${thief.id}`
  // 10% of the target's coins but at least 1, and the thief stakes the same amount
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
    // 60% the coins move to the thief, otherwise the target gets paid
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
