export function replaceMacros(text: string, userName: string, charName: string, persona: string): string {
  if (!text) return '';
  return text
    .replace(/\{\{user\}\}/gi, userName || 'User')
    .replace(/\{\{char\}\}/gi, charName || 'Character')
    .replace(/\{\{persona\}\}/gi, persona || '');
}
