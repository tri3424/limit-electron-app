/**
 * Auto-tagging utility that suggests tags from existing tag pool based on question text
 */

export interface Tag {
  id: string;
  name: string;
}

/**
 * Extracts plain text from HTML string
 */
function extractTextFromHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

/**
 * Calculates similarity score between two strings using simple word matching
 */
function calculateSimilarity(text: string, tagName: string): number {
  const textLower = text.toLowerCase();
  const tagLower = tagName.toLowerCase();
  
  // Exact match
  if (textLower.includes(tagLower) || tagLower.includes(textLower)) {
    return 1.0;
  }
  
  // Word-based matching
  const textWords = textLower.split(/\s+/);
  const tagWords = tagLower.split(/\s+/);
  
  let matches = 0;
  for (const tagWord of tagWords) {
    if (textWords.some(word => word.includes(tagWord) || tagWord.includes(word))) {
      matches++;
    }
  }
  
  return tagWords.length > 0 ? matches / tagWords.length : 0;
}

/**
 * Suggests tags from existing tag pool based on question text
 * @param questionText The question text (can be HTML)
 * @param availableTags List of available tags
 * @param maxSuggestions Maximum number of suggestions to return
 * @returns Array of suggested tag names sorted by relevance
 */
export function suggestTags(
  questionText: string,
  availableTags: Tag[],
  maxSuggestions: number = 5
): string[] {
  if (!questionText || !availableTags || availableTags.length === 0) {
    return [];
  }
  
  const plainText = extractTextFromHtml(questionText);
  if (!plainText.trim()) {
    return [];
  }
  
  // Calculate similarity scores for each tag
  const scoredTags = availableTags.map(tag => ({
    tag,
    score: calculateSimilarity(plainText, tag.name),
  }));
  
  // Filter tags with score > 0 and sort by score (descending)
  const suggestions = scoredTags
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(item => item.tag.name);
  
  return suggestions;
}

