// Name Alert: notice when the user's name (or another keyword they chose) is said.

export function parseKeywords(input: string): string[] {
  return [...new Set(input.split(',').map((word) => word.trim()).filter((word) => word.length >= 2))].slice(0, 10);
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function keywordPattern(keyword: string): RegExp {
  // Word boundaries only make sense for Latin script; other scripts match anywhere.
  const latin = /^[\p{Script=Latin}\d\s'-]+$/u.test(keyword);
  return latin ? new RegExp(`(^|[^\\p{L}\\d])(${escape(keyword)})(?=$|[^\\p{L}\\d])`, 'iu') : new RegExp(`(${escape(keyword)})`, 'iu');
}

export function findKeyword(text: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (keywordPattern(keyword).test(text)) return keyword;
  }
  return null;
}

export type TextPart = { text: string; match: boolean };

// Splits text so matched keywords can be highlighted.
export function splitByKeywords(text: string, keywords: string[]): TextPart[] {
  if (!keywords.length) return [{ text, match: false }];
  const pattern = new RegExp(`(${keywords.map(escape).join('|')})`, 'giu');
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, match: keywords.some((k) => k.toLowerCase() === part.toLowerCase()) }));
}
