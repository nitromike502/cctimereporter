# Stack Research

**Domain:** npx CLI tool serving a local Vue.js web UI with SQLite storage and Gantt-style timeline visualization
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH (core stack HIGH, Gantt library choice MEDIUM due to ecosystem churn)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS (Active) | Runtime | Node 22 is Active LTS as of early 2026; includes built-in `node:sqlite` module which eliminates native binary distribution headaches |
| Vue 3 | 3.5.x | Frontend SPA | User-specified; Composition API is the 2025/2026 standard, Vue 2 is EOL, Vue 3.5 stable with -56% memory improvement |
| Vite | 7.x | Build tool for Vue frontend | Default Vue build tool, replaced Vue CLI (maintenance mode); requires Node 20.19+ or 22.12+; outputs optimized static `dist/` |
| Fastify | 5.x | Local HTTP server (CLI serves API + static assets) | ~5-10% faster than v4, stable v5.7.x current; serves both the Vue `dist/` build and the JSON API; lightweight and plugin-based |
| `node:sqlite` | Built-in (Node 22+) | SQLite database access | **Zero native binary distribution problem.** Built into Node 22+, synchronous API, stability index 1.1 (active dev, usable); eliminates the `better-sqlite3` prebuild-install failures on ARM/musl/Node-version mismatches that plague npx-distributed tools |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hy-vue-gantt` | latest (active, Dec 2024+) | Gantt/timeline chart component | The actively maintained evolution of the abandoned `vue-ganttastic`; TypeScript, Vue 3 Composition API, virtual scrolling, touch support |
| `vue-router` | 5.x | Client-side routing (date nav, deep links) | Vue Router 5 is newly released with file-based routing merged in; no breaking changes from v4 for basic use |
| `pinia` | 3.x | Frontend state management (session data, filters, date selection) | Official Vue state manager; replaces Vuex; Pinia 3 drops Vue 2 and is fully Composition API-native |
| `open` | latest (sindresorhus) | Open browser tab programmatically | Cross-platform (macOS/Windows/Linux+WSL); pure ESM; use to open browser after server starts |
| `@fastify/static` | latest | Serve Vite `dist/` from Fastify | Official Fastify plugin; serve built frontend assets alongside API routes |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `create-vue` (scaffold) | Bootstrap Vue 3 + Vite project | Official scaffolding; prompts for TypeScript, Vue Router, Pinia, Vitest, ESLint |
| Vite dev server | Hot-reload frontend during development | `vite` in `scripts.dev`; in production, build to `dist/` then serve from Fastify |
| TypeScript | Type safety across CLI + frontend | Recommended for the Vue frontend; optional for the CLI/server layer (plain JS is fine given small scope) |
| ESLint + `eslint-plugin-vue` | Linting | `create-vue` sets this up; catches Vue 3 pattern mistakes |

---

## Installation

```bash
# Core runtime dependencies (what ships in the published npm package)
npm install fastify @fastify/static pinia vue-router hy-vue-gantt open

# Vue 3 and its runtime
npm install vue

# Dev dependencies (build tooling, not shipped to users)
npm install -D vite @vitejs/plugin-vue typescript vue-tsc eslint eslint-plugin-vue
```

> Note: `node:sqlite` is a Node.js built-in. No npm install needed. Requires Node 22.x (LTS).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `node:sqlite` (built-in) | `better-sqlite3` | If you must support Node 20 LTS users; has known prebuilt binary failures on ARM64 macOS in npx context, documented in GitHub issues; avoid for npx tools unless you control the environment |
| `node:sqlite` (built-in) | `better-sqlite3` v12.x | `better-sqlite3` has 2-24x performance advantage for heavy query loads — irrelevant for this tool's local single-user usage pattern |
| Fastify 5 | Express 4/5 | Express is simpler to understand; choose if maintainer is unfamiliar with Fastify; Express has more StackOverflow answers. Express fine for this scale. |
| Fastify 5 | `http` (stdlib) | Viable for zero-dep purists; no plugin ecosystem, manual static file serving, not worth it |
| `hy-vue-gantt` | `vue-ganttastic` (original) | Original is abandoned (last publish 4 years ago); `hy-vue-gantt` is its active fork from Dec 2024 |
| `hy-vue-gantt` | D3.js custom Gantt | Maximum flexibility, maximum effort; write your own SVG/canvas timeline if `hy-vue-gantt` doesn't fit the session-bar visualization model |
| `hy-vue-gantt` | Frappe Gantt | Framework-agnostic, simpler; lacks Vue 3 Composition API integration; better if Vue dependency is unwanted |
| Vite 7 | webpack | Webpack is legacy for new projects; Vite 7 is Vue's official build tool, dramatically faster HMR |
| Vue Router 5 | Vue Router 4 | Vue Router 4 is still supported; v5 is drop-in compatible, adds file-based routing; either works |
| Pinia 3 | Vuex 4 | Vuex is in maintenance-only mode; Pinia is the official replacement with less boilerplate |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `better-sqlite3` in an npx tool | Native binaries require compilation or prebuilts; documented failures for ARM64 macOS (Apple Silicon), Node 24 N-API 137 missing prebuilds, musl/Alpine Linux builds; causes `npx` install to fail silently or visibly across common dev machines | `node:sqlite` built-in (requires Node 22+) |
| `sqlite3` (node-sqlite3) | Async C++ bindings, same native distribution problems as `better-sqlite3`, lower performance, owned by TryGhost not original team | `node:sqlite` built-in |
| Vue CLI (`@vue/cli`) | Officially in maintenance mode since 2022; Vite is the replacement for all new projects | `create-vue` + Vite 7 |
| Vuex 4 | Maintenance-only mode; significantly more boilerplate than Pinia | Pinia 3 |
| `vue-ganttastic` (original npm package) | Last published 4 years ago, unmaintained | `hy-vue-gantt` (active fork) |
| Nuxt.js | Server-side rendering framework; this is a local CLI tool, SSR adds complexity with zero benefit | Plain Vue 3 + Vite SPA |
| Webpack | Legacy tooling; Vite 7 is the 2025/2026 standard for Vue 3 projects | Vite 7 |

---

## Stack Patterns by Variant

**For the CLI entry point (`bin/`):**
- Plain Node.js ESM (`.mjs` or `"type": "module"` in package.json)
- Parse `~/.claude/projects/` JSONL files directly (no framework needed)
- Import from `node:sqlite`, `node:fs`, `node:path`, `node:http`
- Spin up Fastify, serve static `dist/`, open browser via `open` package
- Keep CLI logic thin — data layer and rendering live in the Vue app

**For the Vue frontend:**
- Full Vue 3 + Vite 7 SPA
- `hy-vue-gantt` for the Gantt bars
- Pinia store holds the fetched session data
- Vue Router for date-based navigation (`/timeline/2026-02-22`)
- Fetch session data from Fastify API routes (JSON over localhost)

**If Node 22 adoption is a concern:**
- Add a startup check: `if (process.version < 'v22') { error + exit }`
- Document `node>=22` in `engines` field of `package.json`
- Node 22 became Active LTS in October 2024; most active devs have it by 2026

**For the build/publish workflow:**
- `vite build` outputs to `dist/`
- `dist/` is committed to the repo OR built during `npm pack`/`prepublish`
- Fastify serves `dist/` at startup — no CDN, no external assets
- All data stays local; no network calls in production

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Vue 3.5.x | Vite 7.x, Vue Router 5.x, Pinia 3.x | All officially compatible; same ecosystem |
| Vite 7.x | Node 20.19+ or Node 22.12+ | Node 18 dropped (EOL April 2025); Node 22 LTS satisfies this |
| `node:sqlite` | Node 22.5+ (experimental flag), Node 22.13+ (no flag) | Stable enough for production use; stability index 1.1 (active dev); API similar to `better-sqlite3` synchronous API |
| `hy-vue-gantt` | Vue 3.x, TypeScript 5.x | Created Dec 2024 as Vue 3 Composition API-native component |
| Fastify 5.x | Node 20+ | Node 18 support dropped in v5 |
| `open` (sindresorhus) | Node.js ESM projects | Pure ESM; ensure project `"type": "module"` or use dynamic `import()` |

---

## Critical Decision Rationale: `node:sqlite` over `better-sqlite3`

This is the most impactful decision for an npx-distributed tool. Here is the evidence:

1. **Documented npx failure**: GitHub issue `ruvnet/claude-flow#360` shows `better-sqlite3` ARM64 binding error when running via `npx`. This is exactly the distribution model of this project.

2. **Node 24 prebuilds missing**: GitHub issues `WiseLibs/better-sqlite3#1382` and `#1384` show prebuilt binaries are missing for Node 24 as of Jan 2026. Users on the latest Node version face a broken install.

3. **Python venv conflicts**: Python virtual environments break `npm rebuild better-sqlite3` — a real-world problem for Claude Code users who are likely to have Python environments active.

4. **Node.js built-in is sufficient**: `node:sqlite` (available since Node 22.5.0, no experimental flag since 22.13.0) provides a synchronous API functionally equivalent to `better-sqlite3` for this use case. Performance differences (2-24x) are irrelevant for a single-user local tool querying hundreds of rows.

5. **Requires Node 22**: This is a legitimate constraint. Document `"engines": { "node": ">=22.12.0" }` in `package.json`. Node 22 became Active LTS in October 2024; it is the expected baseline for new tools in 2026.

---

## Sources

- Node.js releases page (nodejs.org/en/download/releases) — Node 24 is Active LTS, Node 22 is Maintenance LTS as of Feb 2026 — HIGH confidence
- Node.js SQLite docs (nodejs.org/api/sqlite.html) — stability 1.1, available no-flag since 22.13.0 — HIGH confidence
- `better-sqlite3` GitHub issues #1367, #1382, #1384, and `claude-flow` issue #360 — distribution failure evidence — HIGH confidence
- Vue.js blog (blog.vuejs.org/posts/vue-3-5) — Vue 3.5 released Sept 2024, current stable — HIGH confidence
- WebSearch: Vue 2025 in review (vueschool.io) — Pinia 3, Vue Router 5, Vite as standard — MEDIUM confidence (verified against npm versions)
- WebSearch: Vite 7 (vite.dev/blog/announcing-vite7) — released June 2025, Node 20.19+/22.12+ required — HIGH confidence
- WebSearch: Fastify v5 (openjsf.org, platformatic.dev) — v5.7.4 current, stable GA — MEDIUM confidence
- HyVueGantt GitHub (github.com/Xeyos88/HyVueGantt) — active Dec 2024 fork of vue-ganttastic — MEDIUM confidence (version number not confirmed from npm)
- npm: vue-ganttastic — last published 4 years ago — HIGH confidence (checked)
- npm: pinia — v3.0.4 current — MEDIUM confidence (from WebSearch)
- npm: vue-router — v5.0.3 current — MEDIUM confidence (from WebSearch)
- sindresorhus/open GitHub — cross-platform browser opener, pure ESM — HIGH confidence

---
*Stack research for: npx CLI tool + Vue 3 Gantt timeline + SQLite*
*Researched: 2026-02-22*
