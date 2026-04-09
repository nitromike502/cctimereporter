/**
 * Shared project color assignment using djb2 hash → palette.
 * Used by TimelinePage and TokensPage to ensure consistent project colors.
 */

export const COLOR_PALETTE = [
  '#4e9af1', '#f4a523', '#2ebd6b', '#e05c5c', '#a87fe0',
  '#00c4bc', '#f06292', '#8bc34a', '#ff8f00', '#78909c',
]

/**
 * Returns a deterministic color for a project path using djb2 hash.
 * @param {string} projectPath
 * @returns {string} hex color string
 */
export function projectColor(projectPath) {
  let hash = 5381
  for (const char of projectPath) hash = (hash * 33) ^ char.charCodeAt(0)
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length]
}
