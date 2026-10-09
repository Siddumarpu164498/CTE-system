export interface HighlightMatch {
  start: number;
  end: number;
}

/**
 * Build a normalized copy of `text` plus a map from each normalized index to the
 * original index. When `dropWhitespace` is false, runs of whitespace collapse into a
 * single space; when true, whitespace is removed entirely (handles PDF line-break
 * artefacts such as words split across lines).
 */
function normalizeWithMap(text: string, dropWhitespace: boolean): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (/\s/.test(ch)) {
      if (dropWhitespace || prevSpace) continue;
      norm += " ";
      map.push(i);
      prevSpace = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      prevSpace = false;
    }
  }
  return { norm, map };
}

function normalizeNeedle(text: string, dropWhitespace: boolean): string {
  const lowered = text.toLowerCase().trim();
  return dropWhitespace ? lowered.replace(/\s+/g, "") : lowered.replace(/\s+/g, " ");
}

/** Locate `excerpt` inside `text`, ignoring case and whitespace differences. */
export function findExcerpt(text: string, excerpt: string): HighlightMatch | null {
  if (!text || !excerpt.trim()) return null;
  for (const drop of [false, true]) {
    const { norm, map } = normalizeWithMap(text, drop);
    const needle = normalizeNeedle(excerpt, drop);
    if (!needle) continue;
    const idx = norm.indexOf(needle);
    if (idx >= 0) {
      const start = map[idx];
      const last = map[idx + needle.length - 1];
      if (start !== undefined && last !== undefined) return { start, end: last + 1 };
    }
  }
  return null;
}
