# Contributing to CC Time Reporter

Thank you for your interest in contributing to CC Time Reporter.

## Getting started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Ensure you have Node.js 22+ (the app uses the built-in `node:sqlite` module)

## Development workflow

```bash
# Start the app (builds frontend, starts server, opens browser)
npm start

# Development: Vue dev server with hot reload
npm run dev:client

# Build the production frontend
npm run build
```

## Project structure

- `bin/cli.js` -- Entry point
- `src/db/` -- Database schema and migrations
- `src/importer/` -- JSONL import pipeline
- `src/server/` -- Fastify server and API routes
- `src/client/` -- Vue 3 frontend
- `src/utils/` -- Shared utilities
- `scripts/` -- Python proof-of-concept (reference only)

## Code style

- Use ES modules (`import`/`export`)
- Prefer `node:` prefixed built-in imports
- Follow existing patterns in the codebase

## Making changes

1. Create a branch for your changes
2. Make your changes with clear, descriptive commits
3. Test your changes manually (run `npm start` and verify in browser)
4. Submit a pull request

## Documentation

All documentation lives in `/docs/` following the [Diataxis framework](https://diataxis.fr/).
See [docs/README.md](docs/README.md) for the documentation index and guidelines.

## Reporting issues

Open an issue on GitHub with:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
