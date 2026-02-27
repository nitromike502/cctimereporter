# Phase 4: Component Library - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A custom component system with a live preview page at `/components`. Every component needed for the Timeline UI (Phase 5) is built, documented, and visually verified here before it reaches a feature page. Components: Button, DatePicker, Checkbox, Tooltip, ProgressBar, Badge/Tag.

</domain>

<decisions>
## Implementation Decisions

### Visual design language
- Developer-tool minimal aesthetic (Linear, Raycast, GitHub style) — functional, not decorative
- Color palette from Orases.com brand:
  - Accent green: `#c2d501` (buttons, highlights)
  - Dark navy: `#243846` (headings, dark backgrounds)
  - Teal: `#007da4` (links, hover states)
  - Light gray: `#f6f8fa` (card/section backgrounds)
  - Dark gray: `#3e4d56` (body text)
- System-aware theming — follows OS dark/light preference via `prefers-color-scheme`

### Preview page layout
- Sidebar navigation — left sidebar lists components, clicking one shows it in the main area (Storybook/Vuetify docs pattern)
- Vue SPA route at `/components`, part of the main app (same Vue setup, router, build pipeline)
- All component features/capabilities written out and displayed visually where possible (all states, variants pre-rendered)

### Component behavior
- Use publicly available packages for complex component logic (e.g., headless date picker) — don't rebuild the wheel
- Custom styling with Orases palette on top of package primitives
- All component-level interaction details (date picker style, tooltip triggers, etc.) are Claude's discretion — user reviews in preview page and adjusts if needed

### Design token system
- CSS custom properties (`--color-primary`, `--spacing-md`, etc.) defined in a root stylesheet
- Components consume tokens via `var()`
- Minimal granularity: colors, font sizes, spacing (~15-20 tokens total)
- Tokens support light/dark theming via `prefers-color-scheme`

### Claude's Discretion
- Individual component interaction patterns (date picker calendar vs input, tooltip hover vs click)
- Typography choices (font family, weight scale)
- Spacing scale values
- Border radius, shadow values
- Props API documentation level on preview page
- Which headless/utility packages to use for each component

</decisions>

<specifics>
## Specific Ideas

- Orases.com (`orases.com`) is the color reference — extracted palette should be the source of truth
- Preview page should feel like browsing Storybook or Vuetify docs (sidebar nav, component in main area)
- Custom components, not PrimeVue/Vuetify — but leverage public packages for complex internals

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-component-library*
*Context gathered: 2026-02-26*
