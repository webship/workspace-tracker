/**
 * The text guards: what the base does to a ticket's text before an AI reads it, and to its own text
 * before a person posts it.
 *
 * A ticket is written by whoever can file one. These functions never decide what is true about it;
 * they make what is in it visible (hidden text shown, a fence it cannot close) and they refuse to
 * post what looks like a credential.
 */

/** One word for a shell, single-quoted: a path, a branch, a session name. Never used for ticket text. */
export function shq(v: unknown): string {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

/** Whitespace folded to single spaces. */
export function oneLine(s: unknown): string {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

/** At most `max` characters, said where it was cut. */
export function cap(text: string, max: number): string {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max)}\n[cut here: the text went on for ${s.length - max} more characters]` : s;
}

/**
 * A slug for a branch or a folder: lowercase letters, digits and dashes, `max` characters at most, cut
 * at a dash when it can be. The words a file check reads as a secret are left out, so a spec folder
 * named after a ticket about secrets is not refused as one (the core's evidence check).
 */
export function slug(text: string, max = 40): string {
  let s = String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  s = s.split('-').filter((w) => w && !/secret|credential/.test(w)).join('-');
  if (s.length > max) {
    const cut = s.slice(0, max);
    const at = cut.lastIndexOf('-');
    s = at >= Math.floor(max / 2) ? cut.slice(0, at) : cut;
  }
  return s.replace(/-+$/g, '') || 'item';
}

/**
 * A fence the text cannot close: backticks, one more than the longest run of backticks in it (three
 * at least), so nothing inside ends the block early. A run of tildes cannot close a backtick fence.
 */
export function fenceFor(text: string): string {
  let longest = 0;
  for (const m of String(text || '').matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** The text in a fenced block of its own, labelled as plain text. */
export function fenced(text: string): string {
  const f = fenceFor(text);
  return `${f}text\n${String(text || '').replace(/\s+$/, '')}\n${f}`;
}

// Characters that change what a reader sees without being seen: zero-width ones, the soft hyphen, the
// word joiner and its kin, the byte-order mark, and the bidi controls that reorder a line (the overrides
// U+202A..U+202E and the isolates U+2066..U+2069; the marks U+200E/F).
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Unicode tag characters (U+E0000..U+E007F) spell ASCII that no font draws: text smuggled past the eye.
const TAGS = /(?:\uDB40[\uDC00-\uDC7F])+/g;

const codePoint = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

/** What `reveal` found, for the header and the overview. */
export interface Revealed { text: string; hidden: string[] }

/**
 * The text with everything a page would hide made visible, and a list of what was hidden:
 * HTML comments, collapsed `<details>` blocks, invisible and bidi characters, tag characters.
 * The person reading the snapshot sees what the AI reads.
 */
export function reveal(input: string): Revealed {
  const hidden: string[] = [];
  let text = String(input || '');
  text = text.replace(/<!--([\s\S]*?)(?:-->|$)/g, (_m, inner: string) => {
    hidden.push('an HTML comment');
    return `[hidden text, an HTML comment: ${oneLine(inner)}]`;
  });
  text = text.replace(/<details\b[^>]*>/gi, () => { hidden.push('a collapsed <details> block'); return '[collapsed in the page, starts:]'; })
    .replace(/<\/details\s*>/gi, '[collapsed part ends]');
  text = text.replace(TAGS, (m) => {
    hidden.push('Unicode tag characters');
    const ascii = Array.from(m).map((c) => {
      const n = c.codePointAt(0)! - 0xE0000;
      return n >= 0x20 && n < 0x7F ? String.fromCharCode(n) : '';
    }).join('');
    return `[hidden text, tag characters: ${ascii}]`;
  });
  text = text.replace(INVISIBLE, (c) => {
    hidden.push(/[‪-‮⁦-⁩‎‏]/.test(c) ? 'a bidi control character' : 'an invisible character');
    return `[${codePoint(c)}]`;
  });
  return { text, hidden: [...new Set(hidden)] };
}

/** What a token looks like, by kind. A match blocks a post: it is said by kind, never quoted. */
const TOKEN_SHAPES: [string, RegExp][] = [
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['a GitLab token', /\bgl(?:pat|dt|rt|ptt|cbt|oas|imt|ft|agent|soat)-[A-Za-z0-9_-]{16,}/],
  ['a Slack token', /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/],
  ['an AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['an API key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['a JSON Web Token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['a private key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ['a Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
];

/**
 * The kinds of credential found in a text about to be posted, or [] when there are none. `known` are
 * the provider's own secrets: found as they are, wherever they are. `shapes` are the shapes of the
 * provider's platform's own tokens (its `tokenShapes`), checked beside the ones known here.
 */
export function tokensIn(text: string, known: string[] = [], shapes: Array<[string, RegExp]> = []): string[] {
  const s = String(text || '');
  const found = [...TOKEN_SHAPES, ...shapes].filter(([, re]) => { re.lastIndex = 0; return re.test(s); }).map(([kind]) => kind);
  if (known.some((k) => k && k.length >= 8 && k !== 'CHANGE_ME' && s.includes(k))) found.push("this provider's own token");
  return [...new Set(found)];
}

/**
 * "a" or "an" before a word, by how it sounds: an issue, an OpenProject work package, a work item, a task, a user, an hour.
 * The words a provider names (its noun, its title) are English, and these cover them.
 */
export function article(word: string): 'a' | 'an' {
  const w = String(word || '').trim().toLowerCase();
  if (!w) return 'a';
  // A vowel letter that sounds like "you" or "wun" takes "a"; a silent h takes "an".
  if (/^(uni|use|usu|uti|eu|one|once|ubi|uro|ura)/.test(w)) return 'a';
  if (/^(hour|honest|honou?r|heir)/.test(w)) return 'an';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}

/** The word with its article: "an issue", "a work item". */
export function withArticle(word: string): string {
  return `${article(word)} ${word}`;
}
