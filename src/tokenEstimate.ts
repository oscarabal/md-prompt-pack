/**
 * Dependency-free token estimate for BPE tokenizers (GPT, Claude and similar).
 *
 * It is an approximation, meant to compare a file before and after compaction, not to
 * predict exact billing. Rules: a word with its leading space is one token per ~6 ASCII
 * characters (~3 for non-ASCII letters, which tokenize worse); punctuation runs cost one
 * token per 2 characters; each whitespace run that is not a single space before a word
 * costs one token.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;

  for (const match of text.matchAll(/ ?[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+|\s+/gu)) {
    const piece = match[0];

    if (/^\s+$/.test(piece)) {
      tokens++;
      continue;
    }

    const word = piece.trimStart();
    if (/^[\p{L}\p{N}_]+$/u.test(word)) {
      const divisor = /^[\x00-\x7F]+$/.test(word) ? 6 : 3;
      tokens += Math.max(1, Math.ceil(word.length / divisor));
      continue;
    }

    tokens += Math.ceil(piece.length / 2);
  }

  return tokens;
}

export interface TokenStats {
  before: number;
  after: number;
}

export function formatTokenStats(stats: TokenStats): string {
  const saved = stats.before - stats.after;
  const percent = stats.before === 0 ? 0 : (saved / stats.before) * 100;
  const sign = saved >= 0 ? "−" : "+";
  return `≈${stats.before} → ≈${stats.after} tokens (${sign}${Math.abs(percent).toFixed(1)}%)`;
}
