// Pure text helpers for the foods table. Keep this file free of imports and
// side effects: scripts/tzameret-import.mjs runs it in plain Node.

// Lowercase, drop nikud/cantillation and quote marks, fold final letters
// into their regular forms, collapse spaces. Used on both the stored
// search_text and the query so "קוטג'" finds "קוטג" and "ממרח" finds "ממרח".
export function normalizeHe(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u05F3\u05F4'"`\u2019\u2018\u201C\u201D]/g, '')
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchTextFor(food) {
  return normalizeHe(`${food.name_he || ''} ${food.name_en || ''} ${food.brand || ''}`)
}
