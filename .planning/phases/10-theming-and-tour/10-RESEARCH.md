# Phase 10: Theming and Tour - Research

**Researched:** 2026-03-04
**Domain:** CSS theming / dark mode toggle + first-visit product tour
**Confidence:** HIGH (for theming), MEDIUM (for tour library selection — verified via npm and official docs)

---

## Summary

Phase 10 is two largely independent tasks: (1) adding a persistent light/dark mode toggle, and (2) implementing a first-visit guided tour. Both are well-understood problems with established patterns.

**Theming** is almost done already. `tokens.css` already has a complete `@media (prefers-color-scheme: dark)` block with all semantic colors overridden. What's missing is: a way to *override* the OS preference via a user toggle, persist that choice to `localStorage`, and propagate the active theme to components that need it (the date picker currently reads `matchMedia` directly). The pattern is: apply a `data-theme` attribute on `<html>`, move the dark token block from `@media` to `[data-theme="dark"]`, run a tiny inline script in `index.html` before the app loads to set the attribute from `localStorage` (preventing flash-of-wrong-theme), then expose a Vue composable for the toggle button.

**Tour** is straightforward. **driver.js** (v1.4.0, 5 kB gzipped, zero dependencies, framework-agnostic) is the right library. It supports a `steps[]` array with CSS selector targeting, full lifecycle callbacks including `onDestroyed` (for marking the tour as seen), and CSS class overrides for styling. First-visit detection is just a `localStorage` key check. The tour step targets must have stable CSS class selectors — the key elements (`.toolbar`, `.gantt-chart`, `.session-detail-panel`, `.import-group`, `.datepicker-wrapper`) already exist.

**Primary recommendation:** Use `data-theme` attribute + inline pre-load script for theming (no new dependencies). Use `driver.js` for the tour (one new dependency, ~5 kB gzipped).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| driver.js | 1.4.0 | Guided tour / element highlighting | Framework-agnostic, 5 kB gzipped, zero deps, full TypeScript, active maintenance, no commercial license restriction |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | Theming is native CSS + JS | No library needed; use `data-theme` attribute pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| driver.js | shepherd.js | Shepherd requires commercial license; heavier wrapper layer |
| driver.js | vue-shepherd | Vue-specific wrapper, adds indirection; shepherd still requires license |
| driver.js | vue3-tour | Low maintenance, Vue-specific, smaller community |
| data-theme pattern | @vueuse/core `useDark` | VueUse adds ~3 kB; project currently has zero runtime deps aside from Fastify. The pattern is simple enough to roll without it. |

**Installation:**
```bash
npm install driver.js
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/client/
├── composables/
│   └── useTheme.js          # Dark mode toggle composable (new)
├── styles/
│   └── tokens.css           # Existing — needs data-theme restructure
├── components/
│   ├── TimelineToolbar.vue  # Add theme toggle button here
│   └── AppDatePicker.vue    # Update isDark to use composable, not matchMedia
├── pages/
│   └── TimelinePage.vue     # Wire tour initialization here
└── index.html               # Add inline pre-load script for FOCT prevention
```

---

### Pattern 1: data-theme Attribute for Dark Mode

**What:** Move CSS dark tokens from `@media (prefers-color-scheme: dark)` to `[data-theme="dark"]`. Apply `data-theme` attribute on `<html>`. Read from `localStorage` first, then system preference, on page load.

**Why this approach:** The current `tokens.css` uses `@media (prefers-color-scheme: dark)` which cannot be overridden by user choice without JavaScript. Switching to a `data-theme` attribute lets both the OS preference (default) and the user toggle work cleanly from a single source of truth.

**Important:** Must add a tiny inline `<script>` in `index.html` (before the Vue bundle) to set `data-theme` synchronously. If we wait for Vue to mount, there will be a visible flash of the wrong theme on page load.

**Example (index.html inline script):**
```javascript
// Source: whitep4nth3r.com/blog/best-light-dark-mode-theme-toggle-javascript/
(function() {
  const saved = localStorage.getItem('cctimereporter:theme');
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved ?? (dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();
```

**Example (useTheme.js composable):**
```javascript
// Source: Vue 3 Composition API pattern, verified against Vue docs
import { ref, watch } from 'vue'

const THEME_KEY = 'cctimereporter:theme'

// Single reactive ref shared via module-level singleton
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
  }

  watch(isDark, (dark) => {
    const theme = dark ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  })

  return { isDark, toggle }
}
```

**Example (tokens.css restructure):**
```css
/* Light mode: :root is the default */
:root {
  --color-bg: #ffffff;
  /* ... all light tokens ... */
}

/* Dark mode: activated by data-theme attribute */
[data-theme="dark"] {
  --color-bg: #0d1117;
  /* ... all dark tokens ... */
}

/* System preference fallback (when no data-theme set — JS not yet loaded) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: #0d1117;
    /* ... same dark tokens ... */
  }
}
```

Note: The `@media` fallback block can be kept for no-JS / flash-prevention backup, but with the inline script in `index.html`, in practice `data-theme` will always be set before the CSS applies.

---

### Pattern 2: AppDatePicker Dark Mode Update

**Critical:** `AppDatePicker.vue` currently detects dark mode via `window.matchMedia('(prefers-color-scheme: dark)')`. After the theme toggle is added, the date picker's `:dark` prop must respond to the user's *current theme choice*, not the OS preference.

**Fix:** Replace the local `matchMedia` listener with the `useTheme` composable:

```javascript
// Before (in AppDatePicker.vue):
const isDark = ref(false)
onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDark.value = mediaQuery.matches
  mediaQuery.addEventListener('change', handleThemeChange)
})

// After:
import { useTheme } from '../composables/useTheme.js'
const { isDark } = useTheme()
// No mediaQuery listener needed — composable is reactive
```

---

### Pattern 3: First-Visit Tour with driver.js

**What:** Run a multi-step tour when `localStorage` has no tour-seen flag. Use driver.js `steps[]` array to target existing CSS classes. Set tour-seen flag in `onDestroyed` callback (fires on completion OR dismiss).

**Where to initialize:** In `TimelinePage.vue`'s `onMounted()` hook, after data is loaded (so tour targets exist in DOM). Check localStorage first; skip tour if already seen.

**Example (tour initialization):**
```javascript
// Source: driverjs.com/docs (verified), michalkuncio.com (verified against official docs)
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_KEY = 'cctimereporter:tourSeen'

function startTourIfNew() {
  if (localStorage.getItem(TOUR_KEY)) return

  const tourDriver = driver({
    showProgress: true,
    steps: [
      {
        element: '.datepicker-wrapper',
        popover: {
          title: 'Navigate by Date',
          description: 'Pick any date to view your Claude Code sessions for that day.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '.import-group',
        popover: {
          title: 'Import Sessions',
          description: 'Click Import to scan your Claude Code transcripts and load them into the timeline.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '.gantt-chart',
        popover: {
          title: 'Gantt Timeline',
          description: 'Each bar is a coding session. Sessions are grouped by project. Click a bar to see details.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '.session-detail-panel',
        popover: {
          title: 'Session Details',
          description: 'When you click a session bar, its ticket, branch, working time, and first prompt appear here.',
          side: 'top',
          align: 'start',
        },
      },
    ],
    onDestroyed: () => {
      localStorage.setItem(TOUR_KEY, 'true')
    },
  })

  tourDriver.drive()
}
```

**When to call:** After `onMounted` + `fetchTimeline()` completes. Tour needs the Gantt chart and session panel to be rendered. Since `TimelinePage.vue` fetches on mount, the tour should be initiated in the `.then()` / `finally` of `fetchTimeline()` or after the data ref is populated. A `nextTick()` may be needed to guarantee DOM rendering.

---

### Pattern 4: Theme Toggle Button in Toolbar

**What:** A sun/moon icon button in `TimelineToolbar.vue` that calls `toggle()` from `useTheme()`.

**Where:** Right group of the toolbar, alongside the datepicker and import button. Use `AppButton` with `variant="ghost"` or a bare `<button>` with an SVG icon.

**Accessibility:** Button must have `aria-label` that describes the action ("Switch to dark mode" / "Switch to light mode").

---

### Pattern 5: driver.js Popover Styling to Match Themes

**What:** driver.js ships its own `driver.css` with hardcoded light-theme colors. Must override to match design tokens and respect dark mode.

**How:** Target `.driver-popover` and child classes in a global CSS file (not scoped). Apply CSS custom properties from the design system.

**Example:**
```css
/* In a global CSS file (e.g., src/client/styles/driver-overrides.css) */
.driver-popover {
  background: var(--color-bg);
  color: var(--color-body-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  font-family: var(--font-family);
  font-size: var(--font-size-sm);
}

.driver-popover-title {
  color: var(--color-heading);
  font-size: var(--font-size-base);
}

.driver-popover-description {
  color: var(--color-muted);
  line-height: 1.5;
}

.driver-popover-prev-btn,
.driver-popover-next-btn,
.driver-popover-done-btn {
  background: var(--color-primary);
  color: var(--color-navy);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-family);
}

.driver-popover-close-btn {
  color: var(--color-muted);
}
```

Because `data-theme="dark"` is on `<html>` and driver.js renders popovers inside `<body>`, the CSS custom properties will automatically resolve to dark values when dark mode is active.

---

### Anti-Patterns to Avoid

- **`@media` only for theming:** Cannot be user-overridden. Must switch to `data-theme` attribute.
- **Reading `matchMedia` in components:** Breaks when user overrides OS preference. Components should use the `useTheme` composable instead.
- **Initializing tour before DOM is ready:** If `fetchTimeline()` is still loading, the Gantt chart won't be in the DOM. Check that data is loaded and use `nextTick()` before calling `tourDriver.drive()`.
- **Tour seen flag set only on completion:** User who closes the tour midway will see it again. Set `TOUR_KEY` in `onDestroyed` (fires on both close and completion) not `onDeselected`.
- **Importing driver.js CSS in a scoped `<style>`:** The popover renders outside the component DOM. Driver overrides must be in a global (non-scoped) stylesheet.
- **Multiple `watch` calls in `useTheme` composable:** If multiple components call `useTheme()`, each watch fires. Keep the watcher outside the returned function or use a singleton pattern via module-level refs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Guided tour with highlight overlay | Custom modal + overlay | driver.js | Overlay z-index management, keyboard navigation, scroll-to-element, dimming, positioning are all non-trivial edge cases |
| Tour step positioning near viewport edges | Custom popover | driver.js | Automatic flip/reposition when element is near edge |

**Key insight:** Driver.js' overlay and focus management handles the complexity of z-index stacking, scroll behavior, and repositioning that would take many iterations to get right manually.

---

## Common Pitfalls

### Pitfall 1: Flash of Wrong Theme (FOWT)

**What goes wrong:** The Vue app takes ~100ms to mount. If dark token application happens in `onMounted`, users on dark OS preference see a white flash before dark mode kicks in.

**Why it happens:** CSS renders before JavaScript executes. Without an inline script, tokens.css defaults to `:root` (light) until JS overrides.

**How to avoid:** Add an inline `<script>` tag in `index.html` before `<script type="module">` that synchronously reads localStorage and sets `data-theme` on `<html>`. This runs before first paint.

**Warning signs:** Brief white flash visible on dark-mode systems when refreshing the page.

---

### Pitfall 2: AppDatePicker isDark Desync

**What goes wrong:** After implementing the manual toggle, the date picker still shows the wrong theme because it uses a separate `matchMedia` listener instead of the global theme state.

**Why it happens:** AppDatePicker.vue has its own isolated dark mode detection (`window.matchMedia('(prefers-color-scheme: dark)')`). The user clicking the toggle does not update this local ref.

**How to avoid:** Replace AppDatePicker's local `isDark` + `matchMedia` with the `useTheme()` composable's `isDark`. This makes the date picker reactive to user toggle, not just OS preference.

**Warning signs:** Toggle works for most UI but date picker stays in wrong theme.

---

### Pitfall 3: Tour Runs Before DOM is Populated

**What goes wrong:** If the tour starts before `fetchTimeline()` resolves, the Gantt chart and session panel are not in the DOM. driver.js will silently skip steps with no matching element or throw.

**Why it happens:** `onMounted` fires when the component mounts, but async data fetching hasn't completed yet.

**How to avoid:** Gate the tour on data being available. Either call `startTourIfNew()` inside the `finally` block of `fetchTimeline()`, or watch `timelineData` and trigger once it's populated.

**Warning signs:** Tour runs but skips the Gantt/detail steps, or console errors about missing elements.

---

### Pitfall 4: Duplicate Watch in useTheme Composable

**What goes wrong:** If multiple components import and call `useTheme()` and each call sets up a `watch`, multiple watchers fire on every toggle. This causes redundant `localStorage` writes and `setAttribute` calls (harmless but messy).

**Why it happens:** Vue's `watch` is scoped to each component lifecycle if registered inside the composable function body.

**How to avoid:** Use a module-level singleton pattern: declare `isDark` and the `watch` outside the exported function so they run once when the module loads. The exported function only returns refs and the toggle function.

---

### Pitfall 5: driver.js CSS not Loaded

**What goes wrong:** Tour renders without styles — popover appears as unstyled `<div>`.

**Why it happens:** `import 'driver.js/dist/driver.css'` must be in a component or file that Vite processes. If driver.js is used in a utility module outside Vue components, the CSS import may not be picked up.

**How to avoid:** Import the CSS in the same file that calls `driver()`, or add it to `main.js`.

---

## Code Examples

### Complete useTheme.js Composable

```javascript
// Source: Vue 3 Composition API docs + verified pattern from multiple community sources
// src/client/composables/useTheme.js

import { ref, watch } from 'vue'

const THEME_KEY = 'cctimereporter:theme'

// Module-level singleton — shared across all callers
const isDark = ref(
  document.documentElement.getAttribute('data-theme') === 'dark'
)

// Single watcher at module level — avoids duplicate watchers per component
watch(isDark, (dark) => {
  const theme = dark ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_KEY, theme)
})

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
  }

  return { isDark, toggle }
}
```

### index.html Pre-Load Script (FOWT Prevention)

```html
<!-- Source: whitep4nth3r.com/blog/best-light-dark-mode-theme-toggle-javascript/ (verified) -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CC Time Reporter</title>
    <script>
      (function() {
        var saved = localStorage.getItem('cctimereporter:theme');
        var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var theme = saved !== null ? saved : (dark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

### tokens.css Restructure

```css
/* :root = light mode defaults (always applied) */
:root {
  --color-bg:           #ffffff;
  --color-bg-secondary: #f6f8fa;
  --color-body-text:    #3e4d56;
  --color-heading:      #243846;
  --color-border:       #d0d7de;
  --color-muted:        #6e7c87;
  --color-surface:      #f6f8fa;
  --color-danger:       #d1242f;
  --color-success:      #1a7f37;
  /* spacing, typography, radius, shadows unchanged */
}

/* data-theme="dark" = user/system dark preference */
[data-theme="dark"] {
  --color-bg:           #0d1117;
  --color-bg-secondary: #161b22;
  --color-body-text:    #d0dae0;
  --color-heading:      #c8dce8;
  --color-border:       #30363d;
  --color-muted:        #8b949e;
  --color-surface:      #1a2530;
  --color-danger:       #f85149;
  --color-success:      #3fb950;
}
```

Note: The existing `@media (prefers-color-scheme: dark)` block is replaced entirely by `[data-theme="dark"]`. The inline pre-load script ensures `data-theme` is set from system preference when no localStorage value exists, so there is no gap in coverage.

### Tour Init (in TimelinePage.vue)

```javascript
// Source: driverjs.com/docs/configuration (verified)
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { nextTick } from 'vue'

const TOUR_KEY = 'cctimereporter:tourSeen'

async function fetchTimeline() {
  // ... existing fetch logic ...
  // After data loads:
  if (!localStorage.getItem(TOUR_KEY)) {
    await nextTick()
    startTour()
  }
}

function startTour() {
  const tourDriver = driver({
    showProgress: true,
    onDestroyed: () => localStorage.setItem(TOUR_KEY, 'true'),
    steps: [
      {
        element: '.datepicker-wrapper',
        popover: { title: 'Navigate by Date', description: '...', side: 'bottom' },
      },
      {
        element: '.import-group',
        popover: { title: 'Import Sessions', description: '...', side: 'left' },
      },
      {
        element: '.gantt-chart',
        popover: { title: 'Gantt Timeline', description: '...', side: 'top' },
      },
      {
        element: '.session-detail-panel',
        popover: { title: 'Session Details', description: '...', side: 'top' },
      },
    ],
  })
  tourDriver.drive()
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@media` only for dark mode | `data-theme` attribute with OS fallback | Standard since ~2021 | Enables user override without OS change |
| Reading `matchMedia` in components | Shared composable / singleton ref | Vue 3 Composition API era | Prevents desync between toggle and component state |
| Custom overlay for tours | Driver.js / Shepherd | ~2017+ | Overlay z-index, a11y, keyboard nav handled |

**Deprecated/outdated:**
- `document.body.classList.toggle('dark')`: Works but class on body is less composable than `data-theme` attribute on `html`; `html` scoping covers the entire document including scrollbars.
- `vue-tour` (pulsardev): Vue 2 library; `vue3-tour` fork has minimal maintenance.

---

## Open Questions

1. **Tour on welcome screen vs. populated timeline**
   - What we know: The tour targets `.gantt-chart` and `.session-detail-panel`, which only render when `timelineData.projects.length > 0`.
   - What's unclear: Should the tour be skipped entirely on first visit when there are no imported sessions (the welcome screen shows instead of the Gantt)?
   - Recommendation: Only show the tour after the Gantt chart is visible (sessions exist). If the user is on the welcome/empty state, skip the tour; it will run on first visit after import. This avoids tour steps pointing at invisible elements.

2. **Theme toggle icon**
   - What we know: The toolbar uses AppButton with SVG icons in other places.
   - What's unclear: Whether to use a single toggle icon (sun/moon that flips) or two separate icons.
   - Recommendation: Single button with a sun icon in dark mode and moon icon in light mode (conventional UX). SVG can be inlined as in other components.

3. **driver.js popover z-index vs. date picker popover**
   - What we know: AppDatePicker renders a floating calendar. driver.js renders a popover overlay.
   - What's unclear: If the tour step points to `.datepicker-wrapper` while the calendar is open, there may be z-index conflicts.
   - Recommendation: The tour should not open the date picker calendar; it highlights the input wrapper only. driver.js overlay (z-index 9999 by default) should cover any calendar popup.

---

## Sources

### Primary (HIGH confidence)
- `driverjs.com/docs/installation` — verified install steps, API shape, callback names
- `driverjs.com/docs/configuration` — verified full config options including `steps[]`, `onDestroyed`, `popoverClass`
- `driverjs.com/docs/theming` — verified CSS class list for popover overrides
- `whitep4nth3r.com/blog/best-light-dark-mode-theme-toggle-javascript/` — verified preference cascade pattern (localStorage → system → default), FOWT prevention with inline script
- Codebase: `src/client/styles/tokens.css` — confirmed existing dark token block structure
- Codebase: `src/client/components/AppDatePicker.vue` — confirmed isolated `matchMedia` listener (critical finding)
- npm: `driver.js@1.4.0` — confirmed current version via `npm info`

### Secondary (MEDIUM confidence)
- `vueuse.org/core/useDark/` — confirmed VueUse approach requires `@vueuse/core` dependency; referenced to validate the no-VueUse alternative is viable
- `michalkuncio.com/create-stunning-product-tours-with-driver-js/` — tour setup code verified against official driver.js docs
- `blog.logrocket.com/using-driver-js-guide-user-focus/` — multi-step tour pattern verified against official docs
- WebSearch: driver.js vs shepherd.js bundle size comparison (multiple sources agree ~5 kB gzip for driver.js)

### Tertiary (LOW confidence)
- WebSearch results on Vue 3 provide/inject useTheme pattern — not verified against official docs; the module-level singleton pattern is recommended instead as it is simpler and equivalent for this use case.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — driver.js confirmed current (v1.4.0), API verified via official docs
- Architecture: HIGH — data-theme pattern well-documented; AppDatePicker issue found in actual codebase
- Pitfalls: HIGH for FOWT and isDark desync (code-verified); MEDIUM for tour timing (inferred from async flow)

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (stable libraries; driver.js unlikely to break API in 90 days)
