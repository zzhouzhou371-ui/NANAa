const STICKER_MARKER_PATTERNS = [
  /\[(?:sticker|emoji|reaction|表情包?|贴纸|动图)[^\]]*\]/giu,
  /【(?:sticker|emoji|reaction|表情包?|贴纸|动图)[^】]*】/giu,
  /<(?:sticker|emoji|reaction|表情包?|贴纸|动图)[^>]*>/giu,
] as const;

const EMOJI_KEYCAP_PATTERN = /[#*0-9]\uFE0F?\u20E3/gu;
const EMOJI_CODEPOINT_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3]/gu;
const SPEAKABLE_CHARACTER_PATTERN = /[\p{L}\p{N}]/u;

/**
 * Produces text that may safely be sent to speech synthesis while leaving the
 * original chat message untouched for rendering and transcript display.
 */
export const toSpeakableText = (value: string) => {
  let normalized = value.normalize('NFKC');
  for (const pattern of STICKER_MARKER_PATTERNS) {
    normalized = normalized.replace(pattern, ' ');
  }

  normalized = normalized
    .replace(EMOJI_KEYCAP_PATTERN, '')
    .replace(EMOJI_CODEPOINT_PATTERN, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?，。；：！？、])/g, '$1')
    .replace(/^[\p{P}\p{S}\s]+/u, '')
    .trim();

  return SPEAKABLE_CHARACTER_PATTERN.test(normalized) ? normalized : '';
};
