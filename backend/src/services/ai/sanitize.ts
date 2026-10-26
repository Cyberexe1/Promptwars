const MAX_INPUT_LENGTH = 500;

/** Normalizes user text before it reaches validation, caching, or a prompt. */
export function sanitizeText(
  value: string,
  maxLength = MAX_INPUT_LENGTH,
): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    // The explicit ranges are the C0/C1 controls, excluding tab and newline.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return Array.from(normalized).slice(0, Math.max(0, maxLength)).join('');
}

/** Escapes text embedded inside XML-like prompt delimiters. */
export function escapePromptData(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
