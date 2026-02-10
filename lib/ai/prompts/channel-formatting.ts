/**
 * Channel-Aware Formatting Rules
 *
 * Instructs the LLM to use channel-native formatting instead of Markdown
 * when delivering messages to Telegram, Slack, WhatsApp, etc.
 *
 * Each channel has different formatting capabilities — telling the LLM
 * up front prevents broken formatting in the output.
 */

/**
 * Generate a formatting instruction block based on delivery channel.
 * Returns empty string for app/web delivery (Markdown works fine there).
 */
export function getChannelFormattingBlock(channelType?: string | null): string {
  if (!channelType || channelType === "app") {
    return "";
  }

  switch (channelType) {
    case "telegram":
      return `## Delivery Channel: Telegram

**IMPORTANT: Use plain text formatting only.**
- NO Markdown syntax: no \`**bold**\`, \`## headers\`, \`[links](url)\`, or \`\`\`code blocks\`\`\`
- Use CAPS or spacing for emphasis instead of bold/italic
- Use line breaks and numbered lists for structure
- Paste URLs directly without link syntax
- Keep messages concise and scannable`;

    case "slack":
      return `## Delivery Channel: Slack

**IMPORTANT: Use Slack mrkdwn formatting.**
- Use \`*bold*\` (single asterisks), \`_italic_\`, \`~strikethrough~\`
- NO double asterisks (\`**\`) or headers (\`##\`)
- Use \`\`\`code\`\`\` for inline code, \`\`\`\`\`\` for code blocks
- Use emoji for visual structure (✅ ❌ 📊 🔍)
- Slack automatically linkifies URLs — just paste them`;

    case "whatsapp":
      return `## Delivery Channel: WhatsApp

**IMPORTANT: Use WhatsApp formatting.**
- Use \`*bold*\`, \`_italic_\`, \`~strikethrough~\`
- Use \`\`\`code\`\`\` for code blocks (triple backticks)
- NO headers (\`##\`), NO link syntax (\`[text](url)\`)
- Paste URLs directly — WhatsApp auto-previews them
- Keep messages short and mobile-friendly`;

    case "discord":
      return `## Delivery Channel: Discord

**Discord supports standard Markdown.**
- Use \`**bold**\`, \`*italic*\`, \`~~strikethrough~~\`
- Use \`# headers\` and \`\`\`code blocks\`\`\`
- Discord renders Markdown natively — format as usual`;

    default:
      // Unknown channel — default to plain text
      return `## Delivery Channel: ${channelType}

**IMPORTANT: Use plain text formatting only.**
- Avoid Markdown syntax — it may not render correctly
- Use line breaks, spacing, and CAPS for emphasis
- Paste URLs directly without link syntax`;
  }
}

/**
 * Check if a channel type requires special formatting instructions
 */
export function channelNeedsFormattingGuidance(channelType?: string | null): boolean {
  if (!channelType || channelType === "app") {
    return false;
  }
  return ["telegram", "slack", "whatsapp", "discord"].includes(channelType);
}
