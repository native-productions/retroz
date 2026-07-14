// Keyword asset ranking — a token-free relevance pass that picks the photos most
// likely to fit a run's instruction before any image is loaded into Claude.
//
// Scoring is a lightweight TF/IDF-flavoured overlap between the query
// (task + workflow instruction, or a tool-supplied search string) and each
// asset's searchable text (description + tags + filename). Tags are exact-match
// boosted since they are the most deliberate signal. No embeddings, no API key —
// works under SUBSCRIPTION auth where no key is available.

export interface RankableAsset {
  filename: string;
  description: string;
  tags: string[];
}

// Below this count, ranking is pointless — the whole folder fits cheaply, so
// return everything and let Claude see the full set.
export const RANK_ALWAYS_INCLUDE_THRESHOLD = 12;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at",
  "by", "from", "up", "about", "into", "over", "after", "is", "are", "be", "this",
  "that", "it", "as", "we", "you", "your", "our", "make", "create", "use", "using",
  "image", "images", "photo", "photos", "post", "content", "instagram",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

interface Scored<T> {
  asset: T;
  score: number;
}

/**
 * Score assets against a query and return them sorted most-relevant first.
 * Assets with zero overlap keep their original order at the tail so a caller
 * that takes top-K still gets a stable, sensible fallback set.
 */
export function scoreAssets<T extends RankableAsset>(
  query: string,
  assets: T[],
): Scored<T>[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return assets.map((asset) => ({ asset, score: 0 }));
  }
  const queryTermSet = new Set(queryTerms);

  // Document frequency for IDF — rarer terms discriminate better.
  const docTokens = assets.map((a) => ({
    tags: new Set(a.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)),
    words: new Set(tokenize(`${a.description} ${a.filename} ${a.tags.join(" ")}`)),
  }));
  const df = new Map<string, number>();
  for (const doc of docTokens) {
    for (const term of doc.words) {
      if (queryTermSet.has(term)) df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const n = assets.length || 1;
  const idf = (term: string) => Math.log(1 + n / (1 + (df.get(term) ?? 0)));

  return assets.map((asset, i) => {
    const doc = docTokens[i];
    let score = 0;
    for (const term of queryTermSet) {
      if (doc.words.has(term)) score += idf(term);
      // Exact tag hits are the strongest deliberate signal — boost them.
      if (doc.tags.has(term)) score += idf(term) * 1.5;
    }
    return { asset, score };
  });
}

/**
 * Return up to `limit` assets ranked by relevance to `query`.
 * When the pool is small (<= threshold) or the query is empty, returns the
 * assets unchanged so no relevant photo is ever hidden needlessly.
 */
export function rankAssets<T extends RankableAsset>(
  query: string,
  assets: T[],
  limit: number,
): T[] {
  if (assets.length <= RANK_ALWAYS_INCLUDE_THRESHOLD) return assets;

  const scored = scoreAssets(query, assets);
  const anyMatch = scored.some((s) => s.score > 0);
  if (!anyMatch) return assets.slice(0, limit);

  return scored
    .map((s, i) => ({ ...s, i }))
    // Stable sort: higher score first, original order breaks ties.
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((s) => s.asset);
}
