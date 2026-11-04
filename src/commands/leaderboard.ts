import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} from 'discord.js'
import {
  ButtonComponent,
  Discord,
  SimpleCommand,
  SimpleCommandMessage,
  Slash,
  SlashGroup
} from 'discordx'
import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { members } from '../db/schema.js'
import { levelFromXp } from '../helpers/level.js'

type Board = 'coins' | 'level'
type Row = { userId: string; xp: number; currency: number }

const perPage = 10
const medals = ['🥇 ', '🥈 ', '🥉 ']
const { name, namePlural, emoji } = config.currency

const boards = {
  coins: {
    column: members.currency,
    title: `${emoji} ${name} Leaderboard`,
    swapLabel: `✦ ${config.rank.label}`,
    value: ({ currency }: Row) => `${currency.toLocaleString('de-CH')} ${emoji}`
  },
  level: {
    column: members.xp,
    title: `✦ ${config.rank.label} Leaderboard`,
    swapLabel: `${emoji} ${namePlural}`,
    value: ({ xp }: Row) => `${config.rank.short} ${levelFromXp(xp).level}`
  }
}

const ranked = (board: Board, guildId: string) =>
  and(eq(members.guildId, guildId), gt(boards[board].column, 0))

function rankOf(board: Board, guildId: string, userId: string) {
  const { column } = boards[board]
  const row = db
    .select({ value: column })
    .from(members)
    .where(and(eq(members.userId, userId), ranked(board, guildId)))
    .get()
  if (!row) return

  const ahead = db
    .select({ n: count() })
    .from(members)
    .where(
      and(
        ranked(board, guildId),
        or(
          gt(column, row.value),
          and(eq(column, row.value), lt(members.userId, userId))
        )
      )
    )
    .get()
  return (ahead?.n ?? 0) + 1
}

function rows(board: Board, guildId: string, limit: number, offset = 0): Row[] {
  return db
    .select({
      userId: members.userId,
      xp: members.xp,
      currency: members.currency
    })
    .from(members)
    .where(ranked(board, guildId))
    .orderBy(desc(boards[board].column), asc(members.userId))
    .limit(limit)
    .offset(offset)
    .all()
}

function leaderboard(
  board: Board,
  requestedPage: number,
  guildId: string,
  viewerId: string
) {
  const { title, swapLabel, value } = boards[board]
  const total =
    db.select({ n: count() }).from(members).where(ranked(board, guildId)).get()
      ?.n ?? 0
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(Math.max(1, requestedPage), pages)
  const entries = rows(board, guildId, perPage, (page - 1) * perPage)

  const [top] = rows(board, guildId, 1)
  const width = top ? value(top).length : 0

  const line = (row: Row, rank: number) => {
    const marker = medals[rank - 1] ?? `${rank}. `
    const amount = value(row).padStart(width, ' ')
    const you = row.userId === viewerId ? ' ◂ you' : ''
    return `${marker}\`${amount}\` <@${row.userId}>${you}`
  }

  const viewerRank = rankOf(board, guildId, viewerId)
  const viewerPage = viewerRank ? Math.ceil(viewerRank / perPage) : page
  const firstRank = (page - 1) * perPage + 1

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`lb:${board}:${Math.max(1, page - 1)}:prev`)
      .setLabel('‹')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId('lb:page')
      .setLabel(`${page} / ${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`lb:${board}:${Math.min(pages, page + 1)}:next`)
      .setLabel('›')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === pages),
    new ButtonBuilder()
      .setCustomId(`lb:${board}:${viewerPage}:me`)
      .setLabel('Find me')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!viewerRank || viewerPage === page),
    new ButtonBuilder()
      .setCustomId(`lb:${board === 'coins' ? 'level' : 'coins'}:1:swap`)
      .setLabel(swapLabel)
      .setStyle(ButtonStyle.Secondary)
  ]

  const text = (content: string) => new TextDisplayBuilder().setContent(content)
  const list =
    entries.map((row, i) => line(row, firstRank + i)).join('\n') ||
    'nobody on the board yet. go make some noise'

  const container = new ContainerBuilder()
    .setAccentColor(config.color)
    .addTextDisplayComponents(text(`## ${title}\n${list}`))

  if (viewerRank && viewerPage !== page) {
    const [viewer] = rows(board, guildId, 1, viewerRank - 1)
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(text(line(viewer, viewerRank)))
      .addSeparatorComponents(new SeparatorBuilder())
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [], repliedUser: false }
  }
}

@Discord()
@SlashGroup({
  name: 'lb',
  description: 'See who the house owns',
  contexts: [InteractionContextType.Guild]
})
@SlashGroup('lb')
export class Leaderboard {
  @Slash({
    name: 'coins',
    description: 'Rank everyone by what we let them keep'
  })
  async coinsSlash(interaction: CommandInteraction) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      leaderboard('coins', 1, interaction.guildId, interaction.user.id)
    )
  }

  @Slash({ name: 'level', description: 'Rank everyone by time wasted here' })
  async levelSlash(interaction: CommandInteraction) {
    if (!interaction.inGuild()) return
    await interaction.reply(
      leaderboard('level', 1, interaction.guildId, interaction.user.id)
    )
  }

  @SimpleCommand({ name: 'lb coins', aliases: ['lb'] })
  async coinsText({ message }: SimpleCommandMessage) {
    if (!message.inGuild()) return
    await message.reply(
      leaderboard('coins', 1, message.guildId, message.author.id)
    )
  }

  @SimpleCommand({ name: 'lb level' })
  async levelText({ message }: SimpleCommandMessage) {
    if (!message.inGuild()) return
    await message.reply(
      leaderboard('level', 1, message.guildId, message.author.id)
    )
  }

  @ButtonComponent({ id: /^lb:(coins|level):\d+:/ })
  async navigate(interaction: ButtonInteraction) {
    if (!interaction.inGuild()) return
    const [, board, page, role] = interaction.customId.split(':') as [
      string,
      Board,
      string,
      string
    ]
    const { guildId, user } = interaction
    const rank = role === 'me' ? rankOf(board, guildId, user.id) : undefined
    await interaction.update(
      leaderboard(
        board,
        rank ? Math.ceil(rank / perPage) : Number(page),
        guildId,
        user.id
      )
    )
  }
}
