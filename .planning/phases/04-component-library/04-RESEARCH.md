# Phase 4: Component Library - Research

**Researched:** 2026-02-26
**Domain:** Vue 3 + Vite frontend bootstrap, headless component primitives, design token system
**Confidence:** HIGH (stack), HIGH (Vite/Vue integration), MEDIUM (date picker tradeoffs)

## Summary

Phase 4 introduces Vue 3 and Vite into a project that is currently a pure Node.js/Fastify API server with zero frontend tooling. The work divides into three distinct areas: (1) bootstrapping a Vue SPA alongside the existing Fastify backend, (2) setting up a CSS design token system based on the Orases palette, and (3) building six components (Button, DatePicker, Checkbox, Tooltip, ProgressBar, Badge/Tag) with a Storybook-style preview page at `/components`.

The standard approach is Vite 7 + Vue 3 + Vue Router 5 for the SPA, with the Vite dev server proxying `/api` to Fastify during development. In production, Fastify serves the Vite `dist/` folder via `@fastify/static`. Reka UI (formerly Radix Vue) is the right headless primitive library for Checkbox, Tooltip, and ProgressBar. For DatePicker, `@vuepic/vue-datepicker` is the recommended choice over Reka UI's alpha DatePicker because it is stable, actively maintained (v12.x), and fully customizable via CSS variables that can reference design tokens.

**Primary recommendation:** Scaffold the Vue app in `src/client/` using manual Vite setup (not `npm create vue`), proxy `/api` in `vite.config.js` to the running Fastify port, and serve `dist/` from Fastify in production using `@fastify/static` with a catch-all handler for SPA routing.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vue | ^3.5.29 | UI framework | Current stable; v3.6 beta not ready |
| vite | ^7.x | Build tool + dev server | Current major; requires Node 20.19+/22.12+ (project already uses 22) |
| @vitejs/plugin-vue | ^6.x | Vue SFC support in Vite | Official Vite plugin for .vue files |
| vue-router | ^5.x | Client-side routing | Vue Router 5 merges unplugin-vue-router into core; no breaking changes vs v4 |
| reka-ui | ^2.8.x | Headless primitive components | Successor to Radix Vue; 590k weekly downloads; WAI-ARIA compliant; stable for Checkbox, Tooltip, Progress |
| @vuepic/vue-datepicker | ^12.x | Date picker | Stable (v12), Vue 3.5+ required, CSS variable theming, far more production-ready than Reka UI alpha DatePicker |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/static | ^8.x | Serve Vite dist in production | Required for Fastify v5.x compat (v8+ is required for Fastify 5) |
| @internationalized/date | ^1.x | Date types for Reka UI | Only needed if Reka UI DatePicker is used — skip if using @vuepic/vue-datepicker |

### Alternatives Considered
| Standard Choice | Alternative | Why Standard Wins |
|----------------|-------------|-------------------|
| reka-ui | @headlessui/vue | Headless UI for Vue has fewer components; Reka UI has wider coverage and 2x the weekly downloads in 2026 |
| @vuepic/vue-datepicker | reka-ui DatePicker | Reka UI DatePicker is Alpha — explicit breaking changes warning. @vuepic is v12, stable, matches design-token approach via CSS vars |
| @vuepic/vue-datepicker | floating-vue | Different problem: floating-vue is for tooltips/popovers, not date pickers |
| reka-ui TooltipRoot | floating-vue | Reka UI is already in the dep graph for Checkbox/Progress; use it for Tooltip too to avoid an extra package |
| @fastify/static | @fastify/vite | @fastify/vite is for SSR hybrid apps. This project is a pure SPA — @fastify/static is simpler and appropriate |

**Installation (all at once):**
```bash
npm install vue vue-router reka-ui @vuepic/vue-datepicker
npm install -D vite @vitejs/plugin-vue
npm install @fastify/static
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── client/                  # All Vue frontend code
│   ├── index.html           # Vite entry HTML (references main.js)
│   ├── main.js              # createApp, router, mount
│   ├── App.vue              # Root component with <RouterView>
│   ├── router/
│   │   └── index.js         # createRouter — defines /components and /timeline routes
│   ├── styles/
│   │   └── tokens.css       # CSS custom properties (design tokens) at :root and dark mode
│   ├── components/          # Reusable component library
│   │   ├── AppButton.vue
│   │   ├── AppCheckbox.vue
│   │   ├── AppTooltip.vue
│   │   ├── AppProgressBar.vue
│   │   ├── AppBadge.vue
│   │   └── AppDatePicker.vue
│   └── pages/
│       ├── ComponentsPage.vue    # Preview page at /components
│       └── TimelinePage.vue      # Placeholder for Phase 5
├── server/                  # Existing Fastify server (unchanged)
│   ├── index.js
│   └── routes/
└── db/                      # Existing DB layer (unchanged)

vite.config.js               # At project root (alongside package.json)
dist/                        # Vite build output (gitignored)
```

**Key principle:** `src/client/` and `src/server/` are siblings. The Vite build only touches `src/client/`. The Fastify server only touches `src/server/` and `src/db/`. They share nothing at runtime — the frontend talks to the backend exclusively via HTTP `/api` routes.

### Pattern 1: Vite Dev Server Proxying to Fastify

During development, Vite runs on port 5173. Requests to `/api` are proxied to the Fastify server.

```js
// vite.config.js
// Source: https://vite.dev/config/server-options
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: 'src/client',          // Tell Vite where index.html lives
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3847',  // Fastify default port
        changeOrigin: true,
        // No rewrite — /api prefix is kept because Fastify routes are /api/*
      }
    }
  },
  build: {
    outDir: '../../dist',      // Build to project root dist/
    emptyOutDir: true,
  }
})
```

**Important:** The proxy is dev-only. Vite proxy config has zero effect on `npm run build` output. Production routing is Fastify's job.

### Pattern 2: Fastify Serving the Vite SPA in Production

```js
// src/server/index.js addition (new plugin registration)
// Source: https://github.com/fastify/fastify-static
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createServer(db) {
  const app = Fastify({ logger: false })

  // API routes first (registered before static, so /api/* always hits these)
  app.register(timelineRoute, { db })
  app.register(projectsRoute, { db })
  app.register(importRoute, { db })

  // Serve built Vue app
  app.register(fastifyStatic, {
    root: join(__dirname, '../../dist'),
    wildcard: false,   // Must be false to allow the catch-all below to work
  })

  // SPA catch-all: any unmatched route serves index.html for client-side routing
  app.setNotFoundHandler((req, reply) => {
    reply.sendFile('index.html')
  })

  return app
}
```

**Critical detail:** `wildcard: false` on `@fastify/static` prevents it from registering its own wildcard route that conflicts with the custom 404 handler. The `setNotFoundHandler` must be set AFTER `@fastify/static` is registered.

**API routes registered before static** ensures `/api/*` requests are never accidentally served as static files.

### Pattern 3: Vue SPA Router with /components Route

```js
// src/client/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import ComponentsPage from '../pages/ComponentsPage.vue'
import TimelinePage from '../pages/TimelinePage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/components', component: ComponentsPage },
    { path: '/timeline', component: TimelinePage },
    { path: '/', redirect: '/timeline' },
  ]
})
```

```js
// src/client/main.js
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router/index.js'
import './styles/tokens.css'

createApp(App).use(router).mount('#app')
```

### Pattern 4: Design Tokens — CSS Custom Properties with Dark Mode

```css
/* src/client/styles/tokens.css */
/* Source: prefers-color-scheme MDN docs, Orases palette from CONTEXT.md */

:root {
  /* Brand palette */
  --color-accent:      #c2d501;
  --color-navy:        #243846;
  --color-teal:        #007da4;
  --color-surface:     #f6f8fa;
  --color-text:        #3e4d56;

  /* Semantic aliases (consumed by components) */
  --color-primary:     var(--color-accent);
  --color-heading:     var(--color-navy);
  --color-link:        var(--color-teal);
  --color-bg:          var(--color-surface);
  --color-body-text:   var(--color-text);

  /* Dark mode overrides for semantic tokens only */
  @media (prefers-color-scheme: dark) {
    --color-bg:        #1a2530;
    --color-body-text: #d0dae0;
    --color-heading:   #c8dce8;
    --color-surface:   #243846;
  }

  /* Spacing scale (~8px grid) */
  --spacing-xs:  4px;
  --spacing-sm:  8px;
  --spacing-md:  16px;
  --spacing-lg:  24px;
  --spacing-xl:  40px;

  /* Typography */
  --font-family: system-ui, -apple-system, sans-serif;
  --font-size-sm:   0.875rem;
  --font-size-base: 1rem;
  --font-size-lg:   1.125rem;
  --font-size-xl:   1.25rem;

  /* Surfaces */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.12);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.15);
}
```

**Components consume tokens exclusively via `var()`** — no hardcoded hex values in component files.

### Pattern 5: Reka UI Component — Checkbox Example

```vue
<!-- src/client/components/AppCheckbox.vue -->
<!-- Source: https://reka-ui.com/docs/components/checkbox -->
<script setup>
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui'

defineProps({
  modelValue: Boolean,
  label: String,
  disabled: Boolean,
})
defineEmits(['update:modelValue'])
</script>

<template>
  <label class="checkbox-wrapper">
    <CheckboxRoot
      :checked="modelValue"
      :disabled="disabled"
      class="checkbox-root"
      @update:checked="$emit('update:modelValue', $event)"
    >
      <CheckboxIndicator class="checkbox-indicator">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="2"/>
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>
    <span class="checkbox-label">{{ label }}</span>
  </label>
</template>

<style scoped>
.checkbox-root {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-teal);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}
.checkbox-root[data-state="checked"] {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.checkbox-root[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
```

**Key insight:** Reka UI components expose `data-state`, `data-disabled`, and `data-highlighted` attributes — style them with CSS attribute selectors, not JavaScript.

### Pattern 6: Reka UI Tooltip Example

```vue
<!-- src/client/components/AppTooltip.vue -->
<!-- Source: https://reka-ui.com/docs/components/tooltip -->
<script setup>
import {
  TooltipProvider, TooltipRoot, TooltipTrigger,
  TooltipPortal, TooltipContent, TooltipArrow
} from 'reka-ui'

defineProps({
  content: String,
  side: { type: String, default: 'top' },
})
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent :side="side" class="tooltip-content">
          {{ content }}
          <TooltipArrow class="tooltip-arrow" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
```

**Note:** `TooltipProvider` should ideally wrap the entire app, not each tooltip instance. Either put it in `App.vue` or accept the overhead of per-tooltip providers for isolated components (preview page is fine with per-instance).

### Pattern 7: DatePicker with @vuepic/vue-datepicker

```vue
<!-- src/client/components/AppDatePicker.vue -->
<!-- Source: https://vue3datepicker.com/customization/theming/ -->
<script setup>
import VueDatePicker from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

const model = defineModel()
defineProps({
  disabled: Boolean,
  placeholder: { type: String, default: 'Select date' },
})
</script>

<template>
  <VueDatePicker
    v-model="model"
    :disabled="disabled"
    :placeholder="placeholder"
    auto-apply
    :enable-time-picker="false"
  />
</template>

<style>
/* Override @vuepic/vue-datepicker CSS vars with design tokens */
.dp__theme_light {
  --dp-primary-color:      var(--color-primary);
  --dp-primary-text-color: var(--color-navy);
  --dp-hover-color:        color-mix(in srgb, var(--color-primary) 30%, transparent);
  --dp-border-color:       var(--color-teal);
  --dp-background-color:   var(--color-bg);
  --dp-text-color:         var(--color-body-text);
  --dp-border-radius:      var(--radius-md);
  --dp-font-family:        var(--font-family);
}
</style>
```

**Note:** `@vuepic/vue-datepicker` styles are NOT scoped — they need non-scoped `<style>` to override. Import the dist CSS once (in `main.js` or the component), then override its CSS vars.

### Pattern 8: ComponentsPage — Storybook-Style Layout

```vue
<!-- src/client/pages/ComponentsPage.vue -->
<template>
  <div class="components-layout">
    <aside class="sidebar">
      <nav>
        <a v-for="c in components" :key="c.id"
           :class="{ active: active === c.id }"
           @click="active = c.id">
          {{ c.label }}
        </a>
      </nav>
    </aside>
    <main class="preview-area">
      <component :is="activeComponent" />
    </main>
  </div>
</template>
```

Each component gets a "showcase" sub-component (e.g., `ButtonShowcase.vue`) that renders all variants/states inline.

### Anti-Patterns to Avoid

- **Hardcoding colors in components:** Every color value must be `var(--color-*)`. Changing a hex value in `tokens.css` must propagate everywhere.
- **Using `<style scoped>` for `@vuepic/vue-datepicker` overrides:** Scoped CSS does not penetrate third-party component internals. Use unscoped `<style>` blocks for vendor overrides.
- **Registering `@fastify/static` before API routes:** If static plugin's wildcard catches `/api` first, API routes never execute.
- **Setting `wildcard: true` (the default) on `@fastify/static` with a custom 404 handler:** The plugin's own wildcard conflicts with `setNotFoundHandler`. Use `wildcard: false`.
- **Using `npm create vue@latest` to scaffold:** This creates a standalone project root. The goal is to add a `src/client/` subtree to an existing project — manual setup with `vite.config.js` at project root is correct.
- **Running `vite` without the Fastify server:** During development, both must run. Add a `dev` script that starts both, or accept running them in separate terminals.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checkbox state/aria | Custom div with click handler | `reka-ui CheckboxRoot` | Indeterminate state, aria-checked, keyboard, focus ring — all edge cases |
| Tooltip positioning | CSS `position: absolute` tooltip | `reka-ui TooltipRoot + TooltipPortal` | Flip/shift logic for viewport edges, z-index portaling, focus/hover triggers, escape key dismiss |
| Progress bar | `<div style="width: X%">` | `reka-ui ProgressRoot + ProgressIndicator` | aria-valuenow/min/max, indeterminate state, proper accessibility |
| Date picker calendar | Custom calendar grid | `@vuepic/vue-datepicker` | Keyboard navigation, month navigation, range selection, locale, ARIA — hundreds of edge cases |
| Dark mode detection | JS `window.matchMedia` listener | CSS `@media (prefers-color-scheme: dark)` | Pure CSS approach is instant on page load with no flash; JS adds complexity for same result |
| Proxy in production | Custom proxy middleware in Fastify | `@fastify/static` + API routes registered first | Static serving is already solved; proxy is unnecessary in production because Fastify handles both |

**Key insight:** The "headless" library model means the library owns behavior (ARIA, keyboard, state machine) and the developer owns appearance (CSS). This is exactly what the design decisions call for — custom Orases styling on top of battle-tested primitives.

---

## Common Pitfalls

### Pitfall 1: Development Workflow — Two Servers to Run

**What goes wrong:** Developer runs `node bin/cli.js` which starts Fastify but not Vite. Or runs `vite` without Fastify, and `/api` calls fail with connection refused.

**Why it happens:** The project now has two servers: Fastify (port 3847) for API, Vite (port 5173) for frontend dev.

**How to avoid:** Add an npm script `"dev": "concurrently \"node bin/cli.js\" \"vite\""` using the `concurrently` package, OR accept running two terminals (simpler, no extra dep). Document clearly in CLAUDE.md.

**Warning signs:** API calls in browser show "ERR_CONNECTION_REFUSED" or Vite shows 404 for `/api` routes.

### Pitfall 2: SPA Routing 404s in Production

**What goes wrong:** User navigates to `/components` by typing it in the URL bar. Fastify gets a request for `/components`, finds no route, returns 404. The Vue Router never runs.

**Why it happens:** Fastify handles requests server-side; client-side routing only works once the Vue app is loaded.

**How to avoid:** The `setNotFoundHandler` catch-all in Fastify must serve `index.html` for all non-API, non-static-file routes. The handler checks `req.url.startsWith('/api')` is NOT needed — API routes registered first take priority over the not-found handler.

**Warning signs:** Direct URL navigation to `/components` returns HTML 404 or blank page.

### Pitfall 3: `@fastify/static` wildcard conflicts with 404 handler

**What goes wrong:** `wildcard: true` (default) registers a `/*` route. Fastify 5 route conflicts cause an error, OR the wildcard returns 404 instead of `index.html`.

**Why it happens:** The default wildcard in `@fastify/static` conflicts with `setNotFoundHandler` being used for SPA fallback.

**How to avoid:** Set `wildcard: false` when registering `@fastify/static`. Then `setNotFoundHandler` is the only catch-all.

**Warning signs:** Fastify startup error about duplicate routes, or `index.html` not being served for unknown routes.

### Pitfall 4: Design Tokens Not Available at Component Load Time

**What goes wrong:** CSS `var(--color-primary)` evaluates to empty string in a component because `tokens.css` loads after the component renders.

**Why it happens:** `tokens.css` is imported in `main.js` but some async component or lazy-loaded route doesn't wait.

**How to avoid:** Import `tokens.css` in `main.js` before `createApp` (synchronous import). Or import it in `index.html` via `<link rel="stylesheet">`.

**Warning signs:** Components flash with no color/white background on first render.

### Pitfall 5: Vite `root` and `outDir` path confusion

**What goes wrong:** Vite can't find `index.html`, or builds to the wrong directory.

**Why it happens:** `vite.config.js` is at the project root, but `index.html` is in `src/client/`. The `outDir` must be relative to `root`, not to `vite.config.js` location.

**How to avoid:**
```js
// root: 'src/client' means:
// - index.html is at src/client/index.html
// - outDir: '../../dist' means src/client/../../dist = dist/ at project root
```

**Warning signs:** `Error: Could not resolve entry module "index.html"` or dist files appear in wrong directory.

### Pitfall 6: `@vuepic/vue-datepicker` CSS not imported

**What goes wrong:** Date picker renders with no styles (raw HTML elements, no calendar popup).

**Why it happens:** The package requires explicit CSS import.

**How to avoid:** Add `import '@vuepic/vue-datepicker/dist/main.css'` in either `main.js` (globally) or the `AppDatePicker.vue` component.

**Warning signs:** Date picker input renders as an unstyled `<div>`.

---

## Code Examples

Verified patterns from official sources:

### Vite Config — Full Working Example
```js
// vite.config.js (at project root)
// Source: https://vite.dev/config/server-options
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: 'src/client',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  }
})
```

### src/client/index.html
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CC Time Reporter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

### Fastify Production Static Serving
```js
// src/server/index.js
// Source: https://github.com/fastify/fastify-static
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '../../dist')

export function createServer(db) {
  const app = Fastify({ logger: false })

  // API routes FIRST — must be registered before static plugin
  app.register(timelineRoute, { db })
  app.register(projectsRoute, { db })
  app.register(importRoute, { db })

  // Static serving — wildcard false to allow custom 404 handler
  app.register(fastifyStatic, {
    root: distPath,
    wildcard: false,
  })

  // SPA fallback — any non-API, non-file request serves index.html
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html')
  })

  return app
}
```

### Reka UI Progress Bar
```vue
<!-- Source: https://reka-ui.com/docs/components/progress -->
<script setup>
import { ProgressRoot, ProgressIndicator } from 'reka-ui'
defineProps({ value: { type: Number, default: 0 }, max: { type: Number, default: 100 } })
</script>
<template>
  <ProgressRoot :value="value" :max="max" class="progress-root">
    <ProgressIndicator
      class="progress-indicator"
      :style="{ transform: `translateX(-${100 - (value / max) * 100}%)` }"
    />
  </ProgressRoot>
</template>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Radix Vue | Reka UI (same package, new name) | Mid-2025 rebrand | npm package is now `reka-ui`; radix-vue still works but reka-ui is the canonical name |
| Vue Router 4 | Vue Router 5 | Late 2025 | v5 is drop-in replacement with built-in file-based routing support; API identical |
| Vite 6 | Vite 7 | ~Mid 2025 | Dropped Node 18; Node 20.19+/22.12+ required; project already uses Node 22 — no issue |
| floating-vue (v-tooltip) | Reka UI TooltipRoot | 2024+ | floating-vue last published 2 years ago; Reka UI is the current maintained option |
| Custom CSS dark mode + JS | `@media (prefers-color-scheme: dark)` CSS-only | Always correct, but underused | No JS needed; instant on load |

**Deprecated/outdated:**
- `@headlessui/vue`: Maintained by Tailwind Labs but narrower component set; not the ecosystem leader for Vue in 2026 — Reka UI has wider adoption
- `floating-vue`: Last npm publish 2+ years ago; use Reka UI TooltipRoot instead
- `popperjs`: Replaced by Floating UI internally in all major headless libs
- `radix-vue` (the package name): Still works but `reka-ui` is the canonical successor package name

---

## Open Questions

1. **Production: does Fastify serve `dist/` or does the CLI point the browser at the API port?**
   - What we know: The CLI already opens `http://127.0.0.1:3847` in the browser.
   - What's unclear: Phase 4 plan must decide: does `dist/` get served by Fastify on port 3847 (one port, everything works), OR is the Vue app a separate dev-only thing and production ships Fastify-rendered HTML?
   - Recommendation: Serve `dist/` from Fastify on the same port. One port, one process. The catch-all handler covers SPA routing. This is the simplest production story.

2. **Dev workflow — one process or two?**
   - What we know: `node bin/cli.js` starts Fastify. `vite` starts the dev server on 5173.
   - What's unclear: Should the plan introduce `concurrently` (a new dev dependency) or document two-terminal workflow?
   - Recommendation: Two-terminal workflow for Phase 4. Add `concurrently` only if Phase 5 user feedback shows it's painful. No new runtime dependencies without user decision.

3. **`@fastify/static` version compatibility with Fastify 5**
   - What we know: Fastify v5 requires `@fastify/static >= 8.x`.
   - What's unclear: The exact latest version was not retrieved (npm returned 403 on direct package pages).
   - Recommendation: `npm install @fastify/static` without version pin — npm will resolve the latest compatible version. Verify it's v8+ in package-lock.json after install.

---

## Sources

### Primary (HIGH confidence)
- https://vite.dev/config/server-options — Vite proxy configuration syntax verified
- https://vite.dev/guide/backend-integration — Vite backend integration with manifest
- https://vite.dev/guide/ — Vite 7 Node.js requirements (20.19+/22.12+) verified
- https://reka-ui.com/docs/overview/installation — Reka UI installation and auto-import config
- https://reka-ui.com/docs/components/tooltip — TooltipRoot composition example
- https://reka-ui.com/docs/components/date-picker — DatePicker Alpha status confirmed
- https://github.com/fastify/fastify-static — @fastify/static SPA pattern, wildcard option
- https://vuejs.org/guide/quick-start — Vue 3 createApp + main.js pattern

### Secondary (MEDIUM confidence)
- WebSearch confirmed: reka-ui v2.8.x, 590k weekly downloads, Vue Router 5 released late 2025
- WebSearch confirmed: @vuepic/vue-datepicker v12.1.0, requires Vue 3.5+, CSS variable theming
- WebSearch confirmed: @vitejs/plugin-vue v6.x, @vueuse/core v14.x (requires Vue 3.5+)
- WebSearch confirmed: Vite 7 latest stable (7.3.1), Vite 6 still receives security patches

### Tertiary (LOW confidence)
- `setNotFoundHandler` + `wildcard: false` pattern for Fastify SPA fallback: sourced from GitHub issues discussion, not official docs page — verify during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — library versions verified via WebSearch with multiple sources; Reka UI confirmed via official docs
- Architecture: HIGH — Vite proxy and backend integration verified against official Vite docs; @fastify/static SPA pattern verified against GitHub README
- Pitfalls: MEDIUM — most pitfalls derived from official docs + known integration patterns; `wildcard: false` SPA pattern is LOW confidence (GitHub issues, not docs)

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (30 days — stable library stack, low churn risk)
