import type { Client } from 'discord.js'
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
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
import { card } from '../helpers/card.js'
import { balance, formatCoins, take } from '../helpers/economy.js'
import type { Session } from '../helpers/session.js'
import { sessionTime, settle } from '../helpers/session.js'

const minStake = 10

const gameLine = (game: string) =>
  `-# ${games[game].emoji} ${games[game].label.toLowerCase()}`

function parseStake(input: string, held: number) {
  const text = input.trim().toLowerCase()
  if (text === 'all') return held
  if (text === 'half') return Math.floor(held / 2)
  return Number(text.replace(/[’' ]/g, ''))
}

function menu(
  host: User,
  target: User | GuildMember | undefined,
  guildId: string
) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`gamble:pick:${host.id}:${target?.id ?? ''}`)
    .setPlaceholder('Choose a game')
    .addOptions(
      Object.entries(games)
        .filter(([, { solo }]) => !target || !solo)
        .map(([value, { emoji, label, blurb }]) => ({
          value,
          emoji,
          label,
          description: blurb
        }))
    )
  const hook = target ? ` ${target} is on the hook.` : ''
  const held = formatCoins(balance(host.id, guildId))

  return {
    ...card(
      `## 🎲 gamble session\npick your poison, ${host}.${hook} you're holding \`${held}\``,
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      `-# the house keeps ${config.houseCut}% of every pot`
    ),
    allowedMentions: { users: target ? [target.id] : [], repliedUser: false }
  }
}

function lobby({ id, game, hostId, guestId, stake, deadline }: Session) {
  const invite = guestId
    ? `<@${hostId}> called out <@${guestId}>.`
    : `<@${hostId}> wants a game.`

  return card(
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
  )
}

function close({ id, game, hostId, stake }: Session) {
  settle(id, { [hostId]: stake })
  return card(
    `${gameLine(game)}\n## table closed\n\`${formatCoins(stake)}\` went back to <@${hostId}>`
  )
}

const sessionOf = ({ customId }: ButtonInteraction) =>
  db
    .select()
    .from(sessions)
    .where(eq(sessions.id, Number(customId.split(':')[2])))
    .get()

const refuse = (
  interaction:
    ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction,
  content: string
) => interaction.reply({ content, flags: MessageFlags.Ephemeral })

export async function closeExpired(client: Client) {
  const expired = db
    .select()
    .from(sessions)
    .where(lt(sessions.deadline, Date.now()))
    .all()

  for (const session of expired) {
    const result = games[session.game].timeout?.(session) ?? close(session)
    const channel = await client.channels.fetch(session.channelId)
    if (channel?.isTextBased())
      await channel.messages.edit(session.messageId, result)
  }
}

@Discord()
export class Gamble {
  @Slash({
    name: 'gamble',
    description: 'Feed the house',
    contexts: [InteractionContextType.Guild]
  })
  async slash(
    @SlashOption({
      name: 'user',
      description: 'Who to call out',
      required: false,
      type: ApplicationCommandOptionType.User
    })
    user: User | GuildMember | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) return
    await interaction.reply(menu(interaction.user, user, interaction.guildId))
  }

  @SimpleCommand({ name: 'gamble' })
  async text(
    @SimpleCommandOption({ name: 'user', type: SimpleCommandOptionType.User })
    user: User | GuildMember | undefined,
    { message }: SimpleCommandMessage
  ) {
    if (!message.inGuild()) return
    await message.reply(menu(message.author, user, message.guildId))
  }

  @SelectMenuComponent({ id: /^gamble:pick:/ })
  async pick(interaction: StringSelectMenuInteraction) {
    if (!interaction.inGuild()) return
    const [, , hostId, targetId] = interaction.customId.split(':')
    if (interaction.user.id !== hostId)
      return refuse(interaction, 'not your table. open your own with ?gamble')

    const [game] = interaction.values
    const held = formatCoins(balance(hostId, interaction.guildId))
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`gamble:stake:${game}:${targetId}`)
        .setTitle(`${games[game].label} - how much?`)
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Stake')
            .setDescription(`you're holding ${held}`)
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('stake')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('half')
            )
        )
    )
  }

  @ModalComponent({ id: /^gamble:stake:/ })
  async stake(interaction: ModalSubmitInteraction) {
    if (!interaction.inGuild() || !interaction.isFromMessage()) return
    const [, , game, targetId] = interaction.customId.split(':')
    const { guildId, message, user } = interaction
    const held = balance(user.id, guildId)
    const stake = parseStake(
      interaction.fields.getTextInputValue('stake'),
      held
    )

    if (!Number.isInteger(stake) || stake < minStake)
      return refuse(
        interaction,
        `the house doesn't get up for less than \`${formatCoins(minStake)}\``
      )
    if (!take(user.id, guildId, stake))
      return refuse(interaction, `you're holding \`${formatCoins(held)}\``)

    const session = db
      .insert(sessions)
      .values({
        game,
        guildId,
        channelId: message.channelId,
        messageId: message.id,
        hostId: user.id,
        guestId: targetId || null,
        stake,
        deadline: Date.now() + sessionTime
      })
      .returning()
      .get()
    await interaction.update(
      games[game].solo ? games[game].play(session, user.id) : lobby(session)
    )
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

    await interaction.update(games[session.game].play(session, user.id))
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
    if (interaction.user.id !== session.hostId)
      return refuse(interaction, 'not your table')

    const [, , , input] = interaction.customId.split(':')
    await interaction.update(games[session.game].act!(session, input))
  }
}
