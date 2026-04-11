# Phase 36 Context: Tokens Chart Message Drill-Down

Decisions gathered: 2026-04-10

---

## 1. Drill-Down Trigger and Scope

- **Per Message line chart only.** The Session Totals bar chart keeps its current click behavior (select session in detail panel). No drill-down on bar chart.
- **Single session scope.** Clicking a point on a session's line shows only that session's messages in the time bucket. Not all sessions in the interval.
- **Zero-token points are ignored.** Clicking a point with 0 tokens does nothing. Only points with actual token data are interactive.

## 2. Drill-Down Content

- **Full conversation.** Show both user and assistant messages that fall within the time interval. Not just assistant messages.
- **Inline token counts on assistant messages.** Each assistant message header shows its token count (e.g., "Assistant . 2:12 PM . 8.1K tokens"). User messages show timestamp only.
- **Header shows time range + token total.** Modal title: "Session X . 2:10-2:15 PM . 47.2K tokens" — full context at a glance.

## 3. Drill-Down Container

- **Reuse modal pattern (SessionMessagesModal).** Modal opens over the chart, same visual style as existing messages modal.
- **Modal updates in-place.** If the modal is already open and the user double-clicks another chart point, the modal content swaps without close/reopen animation. The modal stays open until explicitly dismissed.
- **Head/tail truncation.** Same pattern as existing modal: first 10 + last 10 messages with "N messages skipped" divider for large intervals.

## 4. Interaction Model

- **Single click = select session** in the SessionDetailPanel (current behavior, unchanged).
- **Double-click = open drill-down modal** with messages from that session in the clicked time bucket.
- These are separate gestures: single-click is quick session info, double-click is deep dive into messages.

## Deferred Ideas

None captured during discussion.

---

*Context gathered from user discussion on 2026-04-10.*
