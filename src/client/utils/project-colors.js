/**
 * Shared project color assignment with collision avoidance.
 * Used by TimelinePage and TokensPage to ensure consistent, unique project colors.
 *
 * Uses djb2 hash as the preferred index, but shifts to the next available color
 * if two projects hash to the same slot. Assignments are cached per session so
 * the same project always gets the same color within a page lifecycle.
 */

export const COLOR_PALETTE = [
  '#4e9af1', '#f4a523', '#2ebd6b', '#e05c5c', '#a87fe0',
  '#00c4bc', '#f06292', '#8bc34a', '#ff8f00', '#78909c',
]

/** @type {Map<string, string>} projectPath → color */
const assignedColors = new Map()
/** @type {Set<string>} colors already handed out */
const usedColors = new Set()

function djb2(str) {
  let hash = 5381
  for (const char of str) hash = (hash * 33) ^ char.charCodeAt(0)
  return Math.abs(hash)
}

/**
 * Returns a unique color for a project path. Deterministic via djb2 hash,
 * with collision avoidance — if two projects hash to the same color, the
 * second one gets the next unused color in the palette.
 *
 * @param {string} projectPath
 * @returns {string} hex color string
 */
export function projectColor(projectPath) {
  const cached = assignedColors.get(projectPath)
  if (cached) return cached

  const preferred = djb2(projectPath) % COLOR_PALETTE.length
  let color = COLOR_PALETTE[preferred]

  // If preferred color is taken, find the next unused one
  if (usedColors.has(color)) {
    color = COLOR_PALETTE.find(c => !usedColors.has(c))
    // If all colors are used (>10 projects), fall back to preferred (allows dupes)
    if (!color) color = COLOR_PALETTE[preferred]
  }

  assignedColors.set(projectPath, color)
  usedColors.add(color)
  return color
}

/**
 * Reset color assignments. Call when the project list changes (e.g., date navigation).
 */
export function resetProjectColors() {
  assignedColors.clear()
  usedColors.clear()
}
