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
  SimpleCommandOption,
  SimpleCommandOptionType,
  Slash,
  SlashOption
} from 'discordx'
import { eq, lt } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'
import { games } from '../games/index.js'
import { card, editMessage } from '../helpers/card.js'
import { balance, formatCoins, take } from '../helpers/economy.js'
import type { Session } from '../helpers/session.js'
import { sessionTime, settle } from '../helpers/session.js'

const minStake = 10
const guildOnly = [InteractionContextType.Guild]
const [firstGame, ...otherGames] = Object.keys(games)

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

function menu(
  hostId: string,
  targetId: string | undefined,
  guildId: string,
  only?: string
) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`gamble:pick:${hostId}:${targetId ?? ''}`)
    .setPlaceholder('Choose a game')
    .addOptions(
      Object.entries(games)
        .filter(
          ([value, { solo }]) =>
            (!only || value === only) && !(targetId && solo)
        )
        .map(([value, { emoji, label, blurb }]) => ({
          value,
          emoji,
          label,
          description: blurb
        }))
    )
  const hook = targetId ? ` <@${targetId}> is on the hook.` : ''
  const held = formatCoins(balance(hostId, guildId))

  return {
    ...card(
      `## 🎲 gamble session\npick your poison, <@${hostId}>.${hook} you're holding \`${held}\``,
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      `-# the house keeps ${config.houseCut}% of every pot`
    ),
    allowedMentions: { users: targetId ? [targetId] : [], repliedUser: false }
  }
}

const stakeModal = (game: string, targetId: string, held: number) =>
  new ModalBuilder()
    .setCustomId(`gamble:stake:${game}:${targetId}`)
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
  const invite = guestId
    ? `<@${hostId}> called out <@${guestId}>.`
    : `<@${hostId}> wants a game.`

  return {
    ...card(
      `${gameLine(game)}\n## \`${formatCoins(stake)}\` on the table\n` +
        `${invite} match the stake to sit down.\n` +
        `-# closes <t:${Math.floor(deadline / 1000)}:R>`,
      new SeparatorBuilder(),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`gamble:join:${id}`)
          .setLabel(`${guestId ? 'Accept' : 'Join'} - ${formatCoins(stake)}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`gamble:cancel:${id}`)
          .setLabel(guestId ? 'Decline' : 'Cancel')
          .setStyle(ButtonStyle.Secondary)
      )
    ),
    allowedMentions: {
      parse: [],
      users: guestId ? [guestId] : [],
      repliedUser: false
    }
  }
}

function close({ id, game, hostId, stake }: Session) {
  settle(id, { [hostId]: stake })
  return card(
    `${gameLine(game)}\n## table closed\n\`${formatCoins(stake)}\` went back to <@${hostId}>`
  )
}

function begin(
  game: string,
  hostId: string,
  targetId: string | undefined,
  guildId: string,
  channelId: string,
  messageId: string,
  input: string
) {
  const held = balance(hostId, guildId)
  const stake = parseStake(input, held)
  if (!Number.isInteger(stake) || stake < minStake)
    return `the house doesn't get up for less than \`${formatCoins(minStake)}\``
  if (!take(hostId, guildId, stake))
    return `you're holding \`${formatCoins(held)}\``

  const session = db
    .insert(sessions)
    .values({
      game,
      guildId,
      channelId,
      messageId,
      hostId,
      guestId: targetId || null,
      stake,
      deadline: Date.now() + sessionTime
    })
    .returning()
    .get()
  const view = games[game].solo
    ? games[game].play(session, hostId)
    : lobby(session)
  return { session, view }
}

const placed = (id: number, messageId: string) =>
  db.update(sessions).set({ messageId }).where(eq(sessions.id, id)).run()

const sessionOf = ({ customId }: ButtonInteraction) =>
  db
    .select()
    .from(sessions)
    .where(eq(sessions.id, Number(customId.split(':')[2])))
    .get()

const refuse = (interaction: RepliableInteraction, content: string) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral })

async function start(
  game: string,
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  targetId: string | undefined,
  input: string
) {
  if (!interaction.inGuild()) return
  const { user, guildId, channelId } = interaction
  const started = begin(game, user.id, targetId, guildId, channelId!, '', input)
  if (typeof started === 'string') return refuse(interaction, started)
  const { resource } = await interaction.reply({
    ...started.view,
    withResponse: true
  })
  placed(started.session.id, resource!.message!.id)
}

function quick(
  game: string,
  interaction: ChatInputCommandInteraction,
  targetId: string | undefined,
  input: string | undefined
) {
  if (!interaction.inGuild()) return
  if (input) return start(game, interaction, targetId, input)
  return interaction.showModal(
    stakeModal(
      game,
      targetId ?? '',
      balance(interaction.user.id, interaction.guildId)
    )
  )
}

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
export class Gamble {
  @Slash({ name: 'gamble', description: 'Feed the house', contexts: guildOnly })
  async slash(
    @SlashOption(userOption) user: User | GuildMember | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      menu(interaction.user.id, user?.id, interaction.guildId)
    )
  }

  @SimpleCommand({ name: 'gamble' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply(menu(message.author.id, user?.id, message.guildId))
  }

  @SimpleCommand({ name: firstGame, aliases: otherGames })
  async shortcut({ message, prefix, argString }: SimpleCommandMessage) {
    if (!message.inGuild()) return
    const { author, guildId, channelId } = message
    const game = message.content.slice(prefix.length).trim().split(/\s+/)[0]
    const key = game.toLowerCase()
    const targetId = games[key].solo
      ? undefined
      : /<@!?(\d+)>/.exec(argString)?.[1]
    const input = argString.replace(/<@!?\d+>/g, '').trim()

    if (!input) return message.reply(menu(author.id, targetId, guildId, key))
    const started = begin(
      key,
      author.id,
      targetId,
      guildId,
      channelId,
      '',
      input
    )
    if (typeof started === 'string')
      return message.reply({
        content: started,
        allowedMentions: { repliedUser: false }
      })
    const reply = await message.reply(started.view)
    placed(started.session.id, reply.id)
  }

  @Slash({
    name: 'chess',
    description: 'Bet on your brain, if you have one',
    contexts: guildOnly
  })
  chess(
    @SlashOption(userOption) user: User | GuildMember | undefined,
    @SlashOption(stakeOption) stake: string | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    return quick('chess', interaction, user?.id, stake)
  }

  @Slash({
    name: 'blackjack',
    description: 'Get closer to 21 than the house. good luck',
    contexts: guildOnly
  })
  blackjack(
    @SlashOption(stakeOption) stake: string | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    return quick('blackjack', interaction, undefined, stake)
  }

  @Slash({
    name: 'mines',
    description: 'Dig for gems, try not to explode',
    contexts: guildOnly
  })
  mines(
    @SlashOption(stakeOption) stake: string | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    return quick('mines', interaction, undefined, stake)
  }

  @Slash({
    name: 'coinflip',
    description: 'Double or nothing, settled by a coin',
    contexts: guildOnly
  })
  coinflip(
    @SlashOption(userOption) user: User | GuildMember | undefined,
    @SlashOption(stakeOption) stake: string | undefined,
    interaction: ChatInputCommandInteraction
  ) {
    return quick('coinflip', interaction, user?.id, stake)
  }

  @SelectMenuComponent({ id: /^gamble:pick:/ })
  async pick(interaction: StringSelectMenuInteraction) {
    if (!interaction.inGuild()) return
    const [, , hostId, targetId] = interaction.customId.split(':')
    if (interaction.user.id !== hostId)
      return refuse(interaction, 'not your table. open your own with ?gamble')

    const [game] = interaction.values
    await interaction.showModal(
      stakeModal(game, targetId, balance(hostId, interaction.guildId))
    )
  }

  @ModalComponent({ id: /^gamble:stake:/ })
  async stake(interaction: ModalSubmitInteraction) {
    if (!interaction.inGuild()) return
    const [, , game, targetId] = interaction.customId.split(':')
    const input = interaction.fields.getTextInputValue('stake')
    if (!interaction.isFromMessage())
      return start(game, interaction, targetId || undefined, input)

    const { user, guildId, message } = interaction
    const started = begin(
      game,
      user.id,
      targetId,
      guildId,
      message.channelId,
      message.id,
      input
    )
    if (typeof started === 'string') return refuse(interaction, started)
    await interaction.update(started.view)
  }

  @ButtonComponent({ id: /^gamble:join:/ })
  async join(interaction: ButtonInteraction) {
    const session = sessionOf(interaction)
    const { user } = interaction
    if (!session) return refuse(interaction, 'this table is gone')
    if (user.id === session.hostId)
      return refuse(interaction, "you can't sit across from yourself")
    if (session.guestId && user.id !== session.guestId)
      return refuse(interaction, 'this table is not for you')
    if (!take(user.id, session.guildId, session.stake))
      return refuse(
        interaction,
        `you need \`${formatCoins(session.stake)}\` to sit down`
      )

    db.update(sessions)
      .set({ guestId: user.id })
      .where(eq(sessions.id, session.id))
      .run()
    await interaction.update(
      games[session.game].play(session, user.id, interaction.message)
    )
  }

  @ButtonComponent({ id: /^gamble:cancel:/ })
  async cancel(interaction: ButtonInteraction) {
    const session = sessionOf(interaction)
    if (!session) return refuse(interaction, 'this table is gone')
    if (![session.hostId, session.guestId].includes(interaction.user.id))
      return refuse(interaction, 'not your table')

    await interaction.update(close(session))
  }

  @ButtonComponent({ id: /^gamble:act:/ })
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
