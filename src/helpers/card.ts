import type { MessageActionRowComponentBuilder } from 'discord.js'
import {
  ActionRowBuilder,
  Colors,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} from 'discord.js'

type Part =
  string | SeparatorBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>

export function card(...parts: Part[]) {
  const container = new ContainerBuilder().setAccentColor(Colors.Purple)
  for (const part of parts) {
    if (typeof part === 'string')
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(part)
      )
    else if (part instanceof SeparatorBuilder)
      container.addSeparatorComponents(part)
    else container.addActionRowComponents(part)
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [], repliedUser: false }
  }
}
