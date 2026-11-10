import type { Client, RepliableInteraction } from 'discord.js'
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  User
} from 'discord.js'
import {
  ButtonComponent,
  Discord,
  ModalComponent,
  SelectMenuComponent,
  SimpleCommand,
  SimpleCommandMessage,
  Slash,
  SlashChoice,
  SlashOption
} from 'discordx'
import { and, eq, lt } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'
import { games } from '../games/index.js'
import { button, card, editMessage, ping } from '../helpers/card.js'
import { balance, formatCoins, take } from '../helpers/economy.js'
import type { Session } from '../helpers/session.js'
import { sessionTime, settle } from '../helpers/session.js'

type Ask = { game?: string; guestId?: string | null }
type Table = Ask & Pick<Session, 'hostId' | 'guildId' | 'channelId'>
type Send = (view: ReturnType<typeof card>) => Promise<{ id: string }>
type Source =
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction

const minStake = 10
const guildOnly = [InteractionContextType.Guild]

const playable = (friendly: boolean) =>
  Object.keys(games).filter(key => !friendly || games[key].friendly)

const gameOption = {
  name: 'game',
  description: 'What to play',
  required: false,
  type: ApplicationCommandOptionType.String
} as const

const userOption = {
  name: 'user',
  description: 'Who to call out',
  required: false,
  type: ApplicationCommandOptionType.User
} as const

const stakeOption = {
  name: 'stake',
  description: 'A number, half or all',
  required: false,
  type: ApplicationCommandOptionType.String
} as const

const gameLine = (game: string) =>
  `-# ${games[game].emoji} ${games[game].label.toLowerCase()}`

function parseStake(input: string, held: number) {
  const text = input.trim().toLowerCase()
  if (text === 'all') return held
  if (text === 'half') return Math.floor(held / 2)
  return Number(text.replace(/[’' ]/g, ''))
}

function menu(friendly: boolean, { game, hostId, guestId, guildId }: Table) {
  const mode = friendly ? 'play' : 'gamble'
  const select = new StringSelectMenuBuilder()
    .setCustomId(`game:pick:${mode}:${hostId}:${guestId ?? ''}`)
    .setPlaceholder('Choose a game')
    .addOptions(
      playable(friendly)
        .filter(key => (!game || key === game) && !(guestId && games[key].solo))
        .map(value => {
          const { emoji, label, blurb } = games[value]
          return { value, emoji, label, description: blurb }
        })
    )
  const hook = guestId ? `. <@${guestId}> is on the hook` : ''
  const held = formatCoins(balance(hostId, guildId))

  return ping(
    card(
      friendly
        ? `## 🎮 play session\npick a game, <@${hostId}>${hook}`
        : `## 🎲 gamble session\npick your poison, <@${hostId}>${hook}. you're holding \`${held}\``,
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      friendly
        ? "-# on the house. don't get used to it"
        : `-# the house keeps ${config.houseCut}% of every pot`
    ),
    guestId
  )
}

const stakeModal = (game: string, guestId: string, held: number) =>
  new ModalBuilder()
    .setCustomId(`game:stake:${game}:${guestId}`)
    .setTitle(`${games[game].label} - how much?`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Stake')
        .setDescription(`you're holding ${formatCoins(held)}`)
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('stake')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('half')
        )
    )

function lobby({ id, game, hostId, guestId, stake, deadline }: Session) {
  const coins = formatCoins(stake)
  const title = stake ? `\`${coins}\` on the table` : 'friendly game'
  const invite = guestId ? `called out <@${guestId}>` : 'wants a game'
  const seat = stake ? 'match the stake to sit down' : 'sit down to play'
  const join = `${guestId ? 'Accept' : 'Join'}${stake ? ` - ${coins}` : ''}`

  return ping(
    card(
      `${gameLine(game)}\n## ${title}\n<@${hostId}> ${invite}. ${seat}.\n` +
        `-# closes <t:${Math.floor(deadline / 1000)}:R>`,
      new SeparatorBuilder(),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(`join:${id}`, join, ButtonStyle.Success),
        button(`cancel:${id}`, guestId ? 'Decline' : 'Cancel')
      )
    ),
    guestId
  )
}

function close({ id, game, hostId, stake }: Session) {
  settle(id, stake ? { [hostId]: stake } : {})
  const fate = stake
    ? `\`${formatCoins(stake)}\` went back to <@${hostId}>`
    : 'nobody sat down'
  return card(`${gameLine(game)}\n## table closed\n${fate}`)
}

async function answer(
  friendly: boolean,
  table: Table,
  send: Send,
  input?: string
) {
  const { hostId, guildId } = table
  const game = playable(friendly).find(key => key === table.game)
  const paired = table.guestId !== hostId && !(game && games[game].solo)
  const guestId = (paired && table.guestId) || null
  if (!game || (!friendly && !input))
    return void (await send(menu(friendly, { ...table, game, guestId })))

  const held = balance(hostId, guildId)
  const stake = friendly ? 0 : parseStake(input!, held)
  const taken = and(eq(sessions.hostId, hostId), eq(sessions.stake, 0))
  if (friendly && db.select().from(sessions).where(taken).get())
    return 'you already have a table open'
  if (!friendly && (!Number.isInteger(stake) || stake < minStake))
    return `the house doesn't get up for less than \`${formatCoins(minStake)}\``
  if (!friendly && !take(hostId, guildId, stake))
    return `you're holding \`${formatCoins(held)}\``

  const deadline = Date.now() + sessionTime
  const session = db
    .insert(sessions)
    .values({ ...table, game, guestId, stake, deadline, messageId: '' })
    .returning()
    .get()
  const view = games[game].solo ? games[game].play(session) : lobby(session)
  const { id: messageId } = await send(view)
  db.update(sessions)
    .set({ messageId })
    .where(eq(sessions.id, session.id))
    .run()
}

const refuse = (interaction: RepliableInteraction, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral })

async function reply(
  interaction: Source,
  friendly: boolean,
  ask: Ask,
  input?: string
) {
  const { user, guildId, channelId } = interaction
  const error = await answer(
    friendly,
    { ...ask, hostId: user.id, guildId: guildId!, channelId: channelId! },
    async view => {
      if (
        interaction.isMessageComponent() ||
        (interaction.isModalSubmit() && interaction.isFromMessage())
      ) {
        await interaction.update(view)
        return interaction.message
      }
      const sent = await interaction.reply({ ...view, withResponse: true })
      return sent.resource!.message!
    },
    input
  )
  if (error) await refuse(interaction, error)
}

async function fromText(
  friendly: boolean,
  { message, argString }: SimpleCommandMessage
) {
  if (!message.inGuild()) return
  const { author, guildId, channelId } = message
  const words = argString.toLowerCase().split(/\s+/).filter(Boolean)
  const mention = words.find(word => /^<@!?\d+>$/.test(word))
  const game = words.find(word => playable(false).includes(word))
  const stake = words.filter(word => word !== mention && word !== game)
  const error = await answer(
    friendly,
    {
      game,
      guestId: mention?.replace(/\D/g, ''),
      hostId: author.id,
      guildId,
      channelId
    },
    view => message.reply(view),
    stake.join(' ')
  )
  if (error)
    await message.reply({
      content: error,
      allowedMentions: { repliedUser: false }
    })
}

function fromSlash(
  friendly: boolean,
  interaction: ChatInputCommandInteraction,
  ask: Ask,
  stake?: string
) {
  if (!interaction.inGuild()) return
  const held = balance(interaction.user.id, interaction.guildId)
  return friendly || !ask.game || stake
    ? reply(interaction, friendly, ask, stake)
    : interaction.showModal(stakeModal(ask.game, ask.guestId ?? '', held))
}

const sessionOf = ({ customId }: ButtonInteraction) =>
  db
    .select()
    .from(sessions)
    .where(eq(sessions.id, Number(customId.split(':')[2])))
    .get()

export async function closeExpired(client: Client) {
  const expired = db
    .select()
    .from(sessions)
    .where(lt(sessions.deadline, Date.now()))
    .all()

  for (const session of expired) {
    const { timeout } = games[session.game]
    const result =
      session.state && timeout ? timeout(session, client) : close(session)
    await editMessage(client, session.channelId, session.messageId, result)
  }
}

@Discord()
export class Play {
  @Slash({
    name: 'play',
    description: 'Play for nothing but pride',
    contexts: guildOnly
  })
  play(
    @SlashChoice(...playable(true))
    @SlashOption(gameOption)
    game: string | undefined,
    @SlashOption(userOption) user: User | GuildMember | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    return fromSlash(true, interaction, { game, guestId: user?.id })
  }

  @Slash({ name: 'gamble', description: 'Feed the house', contexts: guildOnly })
  gamble(
    @SlashChoice(...playable(false))
    @SlashOption(gameOption)
    game: string | undefined,
    @SlashOption(userOption) user: User | GuildMember | undefined,
    @SlashOption(stakeOption) stake: string | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    return fromSlash(false, interaction, { game, guestId: user?.id }, stake)
  }

  @SimpleCommand({ name: 'play' })
  playText(command: SimpleCommandMessage) {
    return fromText(true, command)
  }

  @SimpleCommand({ name: 'gamble' })
  gambleText(command: SimpleCommandMessage) {
    return fromText(false, command)
  }

  @SelectMenuComponent({ id: /^game:pick:/ })
  async pick(interaction: StringSelectMenuInteraction) {
    if (!interaction.inGuild()) return
    const [, , mode, hostId, guestId] = interaction.customId.split(':')
    const [game] = interaction.values
    if (interaction.user.id !== hostId)
      return refuse(interaction, `not your table. open your own with ?${mode}`)

    if (mode === 'play') return reply(interaction, true, { game, guestId })
    await interaction.showModal(
      stakeModal(game, guestId, balance(hostId, interaction.guildId))
    )
  }

  @ModalComponent({ id: /^game:stake:/ })
  async stake(interaction: ModalSubmitInteraction) {
    if (!interaction.inGuild()) return
    const [, , game, guestId] = interaction.customId.split(':')
    const stake = interaction.fields.getTextInputValue('stake')
    await reply(interaction, false, { game, guestId }, stake)
  }

  @ButtonComponent({ id: /^game:join:/ })
  async join(interaction: ButtonInteraction) {
    const session = sessionOf(interaction)
    const { user } = interaction
    if (!session) return refuse(interaction, 'this table is gone')
    if (user.id === session.hostId)
      return refuse(interaction, "you can't sit across from yourself")
    if (session.guestId && user.id !== session.guestId)
      return refuse(interaction, 'this table is not for you')
    if (session.stake && !take(user.id, session.guildId, session.stake))
      return refuse(
        interaction,
        `you need \`${formatCoins(session.stake)}\` to sit down`
      )

    const seated = db
      .update(sessions)
      .set({ guestId: user.id })
      .where(eq(sessions.id, session.id))
      .returning()
      .get()
    await interaction.update(
      games[seated.game].play(seated, interaction.message)
    )
  }

  @ButtonComponent({ id: /^game:cancel:/ })
  async cancel(interaction: ButtonInteraction) {
    const session = sessionOf(interaction)
    if (!session) return refuse(interaction, 'this table is gone')
    if (![session.hostId, session.guestId].includes(interaction.user.id))
      return refuse(interaction, 'not your table')

    await interaction.update(close(session))
  }

  @ButtonComponent({ id: /^game:act:/ })
  async act(interaction: ButtonInteraction) {
    const session = sessionOf(interaction)
    if (!session) return refuse(interaction, 'this table is gone')
    const { user, client, customId } = interaction
    if (![session.hostId, session.guestId].includes(user.id))
      return refuse(interaction, 'not your table')

    const [, , , input] = customId.split(':')
    await interaction.update(
      games[session.game].act!(session, input, user.id, client)
    )
  }
}
