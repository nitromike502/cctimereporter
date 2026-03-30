# How to test the v0.8.0 programmatic data access features

*Last updated: 2026-03-29*

## Overview

This guide covers testing all v0.8.0 features of CC Time Reporter: CLI subcommands for
JSON output, an MCP server for AI agent integration, multi-instance coordination, and
backward compatibility with the existing web UI.

The test cases have been split into 4 focused documents for easier navigation. Each file
is self-contained with its own prerequisites and numbered test cases.

## Test Documents

| Document | Tests | Description |
|----------|-------|-------------|
| [TEST-CLI-SUBCOMMANDS.md](TEST-CLI-SUBCOMMANDS.md) | 1.1 -- 1.15 | CLI `summary`, `sessions`, `import` subcommands with JSON output |
| [TEST-MCP-SERVER.md](TEST-MCP-SERVER.md) | 2.1 -- 2.14 | MCP server tools (query and action) via JSON-RPC over stdio |
| [TEST-MULTI-INSTANCE.md](TEST-MULTI-INSTANCE.md) | 3.1 -- 3.4 | Server lock detection, stale lock reclaim, import lock enforcement |
| [TEST-SERVICE-REGRESSION.md](TEST-SERVICE-REGRESSION.md) | 4.1 -- 4.5 | Web UI API endpoints (timeline, import SSE, messages, PATCH) |

## Quick Start

```bash
cd /home/claude/cctimereporter
npm install
node bin/cli.js import --all    # Seed the database
```

Then work through each test document in order. Most tests can be run independently, but
the multi-instance tests (Section 3) require two terminal windows.

## Related Guides

- [CHANGELOG](/CHANGELOG.md) for v0.8.0 release notes
- [Architecture overview](../architecture/) for system design details
- [CLAUDE.md](/CLAUDE.md) for project architecture and API reference
