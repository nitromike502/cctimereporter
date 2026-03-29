# Quick-start tutorial

*Estimated time: 5-10 minutes*

## What you'll learn

By the end of this tutorial, you will:

- Have CC Time Reporter running and displaying your Claude Code sessions
- Know how to read the Gantt-style timeline and navigate between dates
- Be able to inspect session details, filter projects, and zoom the chart
- Understand how to edit session metadata and use CLI subcommands

## Prerequisites

Before starting, ensure you have:

- **Node.js 22 or later** installed (CC Time Reporter uses the built-in `node:sqlite` module).
  Check with `node --version`. If you need to upgrade, visit [nodejs.org](https://nodejs.org/).
- **Claude Code** installed and used for at least a few sessions.
  CC Time Reporter reads the JSONL transcript files that Claude Code stores under `~/.claude/projects/`. If you haven't used Claude Code yet, there won't be any data to display.

## Step 1: Install and run

Open a terminal and run:

```bash
npx cctimereporter
```

Two things happen:

1. A local web server starts on port 3847 (or the next available port).
2. Your default browser opens to today's timeline.

You should see output like:

```
cctimereporter running at http://127.0.0.1:3847
Press Ctrl+C to stop.
```

On your first visit, a **Welcome** screen appears with a large "Import Sessions" button. Click it now.

The import scans your Claude Code transcripts from the last 30 days. A progress bar appears at the top of the page showing how many files have been processed. When the import finishes, the timeline loads automatically.

> **Note:** If you see "No sessions found" after importing, try navigating to a recent date when you used Claude Code (step 4 explains how).

## Step 2: Explore the timeline

The main view is a Gantt chart on a 24-hour horizontal axis:

- **Colored bars** represent coding sessions. Each color corresponds to a project.
- **Gray segments** within a bar are idle gaps -- periods longer than the idle threshold (default: 10 minutes) where no messages were exchanged.
- **Project swim lanes** group sessions by project, with the project name on the left.
- **Bar labels** show the ticket ID, git branch, or first words of your initial prompt (whichever is available).
- **Day summary** at the bottom shows total working time broken down by project, ticket, and branch.

A **guided tour** pops up on your first visit and highlights these elements. Follow its prompts to get oriented, or dismiss it to explore on your own.

## Step 3: Navigate dates

The toolbar at the top provides several ways to change the displayed date:

- **Previous / Next** buttons (left and right arrows) move one day at a time.
- **Today** and **Yesterday** buttons jump directly to those dates.
- **Date picker** -- click the date display to open a calendar and jump to any date.

The URL updates to `/timeline?date=YYYY-MM-DD` as you navigate, so you can bookmark or share specific dates.

## Step 4: Inspect a session

Click any session bar in the chart. The **detail panel** on the right shows:

| Field | Description |
|-------|-------------|
| Session name | Ticket, branch, or initial prompt text |
| Session ID | Unique identifier (useful for CLI lookups) |
| Ticket | Detected JIRA-style ticket ID, if any |
| Branch | Git branch the session was working on |
| Project | Project name and path |
| Working time | Active coding time (excluding idle gaps) |
| Wall-clock span | Total time from first to last message |
| Messages | Number of messages in the session |
| Idle gaps | Number of idle periods detected |

You can also click **Messages** to open a modal showing the first messages of the conversation, giving you a quick preview of what the session was about.

Click the same bar again to deselect it.

## Step 5: Filter projects

When you work across multiple projects, the chart can get busy. If more than one project has sessions on the displayed date, a **Projects** filter bar appears above the chart.

Uncheck a project's checkbox to hide its sessions from the chart. Check it again to bring them back. The day summary at the bottom updates to reflect only the visible projects.

## Step 6: Zoom the chart

For days with many sessions or sessions clustered in a short time window, zooming helps:

- **Scroll wheel** over the chart to zoom in and out.
- **Drag** the chart to pan left and right when zoomed in.
- **Zoom controls** in the chart toolbar let you zoom with buttons.

Zoom resets to 1x when you navigate to a different date.

## Step 7: Edit a session

Sometimes the auto-detected label or ticket isn't right. To fix it:

1. Click a session bar to select it.
2. Click the **Edit** button in the detail panel.
3. Change the **Label** (display name) or **Ticket** (ticket override) fields.
4. Click **Save**.

Your edits are stored in the database and persist across re-imports. The original auto-detected values are never overwritten.

## Step 8: Try CLI subcommands

CC Time Reporter also works from the command line for scripting and automation. All subcommands output JSON to stdout.

**Day summary** -- ticket-grouped working time:

```bash
npx cctimereporter summary --pretty
npx cctimereporter summary --date 2026-03-25 --pretty
```

**Session list** -- all sessions for a date:

```bash
npx cctimereporter sessions --date 2026-03-25 --pretty
```

**Import** -- trigger a transcript import without opening the browser:

```bash
npx cctimereporter import              # Last 2 days (default)
npx cctimereporter import --all        # Full history
npx cctimereporter import --days 7     # Custom window
```

All subcommands accept `--idle <minutes>` to configure the idle threshold.

## Step 9: Set up the MCP server

CC Time Reporter includes an MCP (Model Context Protocol) server so AI assistants like Claude Code can query your session data programmatically.

To enable it, add this to your MCP configuration:

```json
{
  "mcpServers": {
    "cctimereporter": {
      "command": "npx",
      "args": ["cctimereporter", "--mcp"]
    }
  }
}
```

The MCP server provides tools for querying summaries, sessions, messages, and triggering imports. See the [MCP Server section in the README](../../README.md) for the full list of available tools.

## What you've accomplished

You've successfully:

- Installed and launched CC Time Reporter
- Imported your Claude Code session transcripts
- Read and navigated the Gantt-style timeline
- Inspected session details, filtered projects, and zoomed the chart
- Edited session metadata (label and ticket)
- Used CLI subcommands for scripting
- Learned how to set up the MCP server for AI assistant integration

## Next steps

Now that you're up and running:

- Explore the [CLI subcommands](../../README.md) in more detail for automation workflows
- Check the [API endpoints](../reference/) for building custom integrations
- Read the [project README](../../README.md) for configuration options (database location, default port, idle threshold)

---

*Having trouble? [Open an issue](https://github.com/meckert/cctimereporter/issues) on GitHub.*
