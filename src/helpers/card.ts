import type {
  Client,
  MessageActionRowComponentBuilder,
  MessageEditOptions
} from 'discord.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

export const ping = <View extends ReturnType<typeof card>>(
  view: View,
  userId?: string | null
) => ({
  ...view,
  allowedMentions: { ...view.allowedMentions, users: userId ? [userId] : [] }
})

export const button = (
  id: string,
  label: string,
  style = ButtonStyle.Secondary
) =>
  new ButtonBuilder().setCustomId(`game:${id}`).setLabel(label).setStyle(style)

export async function editMessage(
  client: Client,
  channelId: string,
  messageId: string,
  view: MessageEditOptions
) {
  const channel = await client.channels.fetch(channelId).catch(console.error)
  if (channel?.isTextBased())
    await channel.messages.edit(messageId, view).catch(console.error)
}
