import type {
  Client,
  MessageActionRowComponentBuilder,
  MessageEditOptions
} from 'discord.js'
import {
  ActionRowBuilder,
  Colors,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder
} from 'discord.js'

type Part =
  | string
  | SeparatorBuilder
  | MediaGalleryBuilder
  | ActionRowBuilder<MessageActionRowComponentBuilder>

export function card(...parts: Part[]) {
  const container = new ContainerBuilder().setAccentColor(Colors.Purple)
  for (const part of parts) {
    if (typeof part === 'string')
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(part)
      )
    else if (part instanceof SeparatorBuilder)
      container.addSeparatorComponents(part)
    else if (part instanceof MediaGalleryBuilder)
      container.addMediaGalleryComponents(part)
    else container.addActionRowComponents(part)
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [], repliedUser: false }
  }
}

export async function editMessage(
  client: Client,
  channelId: string,
  messageId: string,
  view: MessageEditOptions
) {
  const channel = await client.channels.fetch(channelId)
  if (channel?.isTextBased()) await channel.messages.edit(messageId, view)
}
