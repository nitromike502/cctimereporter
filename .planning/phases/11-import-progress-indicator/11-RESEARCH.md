# Phase 11: Import Progress Indicator - Research

**Researched:** 2026-03-05
**Domain:** Real-time server-to-client progress streaming (Fastify SSE + Vue 3)
**Confidence:** HIGH

## Summary

The current import system uses a simple POST /api/import endpoint that blocks until completion, returning results only at the end. The frontend shows an indeterminate progress bar. To provide real-time progress, we need server-to-client streaming during import.

Server-Sent Events (SSE) is the right transport for this. It is unidirectional (server-to-client), built into browsers via `EventSource`, requires no new dependencies, and fits the "progress updates" use case perfectly. WebSockets would be overkill for one-way progress reporting.

The implementation requires three changes: (1) modify `importAll()` to accept a progress callback, (2) create a new SSE endpoint that streams progress events during import, and (3) update the frontend to consume SSE events and display determinate progress.

**Primary recommendation:** Use raw Fastify `reply.hijack()` + `reply.raw` for SSE (no plugin needed), add a progress callback to `importAll()`, and drive the existing `AppProgressBar` component with real values instead of indeterminate mode.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| EventSource (browser API) | Built-in | Client-side SSE consumption | Native browser API, no library needed |
| reply.hijack() + reply.raw | Fastify 5.x built-in | Server-side SSE streaming | Avoids new dependency for a single endpoint |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AppProgressBar (existing) | N/A | Determinate progress display | Already exists with value/max props |
| Reka UI ProgressRoot | Already installed | Accessible progress primitive | Already used by AppProgressBar |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw SSE via reply.hijack() | @fastify/sse plugin | Plugin adds dependency for one endpoint; raw approach is ~15 lines |
| SSE | Polling (GET /api/import/status) | Polling adds latency, wastes requests; SSE is push-based and simpler |
| SSE | WebSockets | WebSockets need bidirectional setup; overkill for one-way progress |
| SSE | Response streaming (chunked JSON) | Less standard, harder to parse incrementally, no auto-reconnect |

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended Changes

```
src/
├── importer/
│   └── index.js               # Add onProgress callback to importAll()
├── server/
│   └── routes/
│       └── import.js           # Add GET /api/import/progress SSE endpoint
│                               # Modify POST /api/import to remain as fallback
└── client/
    ├── pages/
    │   └── TimelinePage.vue    # Use EventSource instead of fetch for import
    └── components/
        └── TimelineToolbar.vue # Pass progress values to AppProgressBar
```

### Pattern 1: Progress Callback in importAll()

**What:** Add an `onProgress` callback option to `importAll()` that fires after each file is processed.
**When to use:** Whenever import progress needs to be reported externally.
**Example:**
```javascript
// In src/importer/index.js
export async function importAll(db, options = {}) {
  const { force = false, verbose = false, maxAgeDays = 30, onProgress } = options;

  // ... discovery phase ...

  // Count total files to import across all projects
  let totalFiles = 0;
  let processedFiles = 0;

  // First pass: discover all files and determine which need importing
  const projectWork = [];
  for (const project of projects) {
    const files = findTranscriptFiles(project.transcriptDir);
    const toImport = []; // ... filtering logic ...
    projectWork.push({ project, toImport });
    totalFiles += toImport.length;
  }

  // Emit initial progress
  onProgress?.({ phase: 'importing', processed: 0, total: totalFiles, currentFile: null });

  // Second pass: import files
  for (const { project, toImport } of projectWork) {
    for (const file of toImport) {
      // ... import logic ...
      processedFiles++;
      onProgress?.({
        phase: 'importing',
        processed: processedFiles,
        total: totalFiles,
        currentFile: file.sessionId,
      });
    }
  }

  onProgress?.({ phase: 'complete', processed: processedFiles, total: totalFiles });
}
```

### Pattern 2: SSE Endpoint with reply.hijack()

**What:** A GET endpoint that starts import and streams progress as SSE events.
**When to use:** When the client needs real-time progress during import.
**Example:**
```javascript
// In src/server/routes/import.js
fastify.get('/api/import/progress', async (request, reply) => {
  if (importRunning) {
    reply.code(409);
    return { error: 'Import already in progress' };
  }

  importRunning = true;
  reply.hijack();

  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Detect client disconnect
  let clientConnected = true;
  request.raw.on('close', () => { clientConnected = false; });

  function sendEvent(eventName, data) {
    if (!clientConnected) return;
    raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const { maxAgeDays } = request.query;
    const result = await importAll(db, {
      maxAgeDays: maxAgeDays ? parseInt(maxAgeDays, 10) : undefined,
      onProgress(progress) {
        sendEvent('progress', progress);
      },
    });
    sendEvent('complete', result);
  } catch (err) {
    sendEvent('error', { message: err.message });
  } finally {
    importRunning = false;
    raw.end();
  }
});
```

### Pattern 3: Frontend EventSource Consumption

**What:** Use the browser's native EventSource API to consume SSE progress events.
**When to use:** In the triggerImport function to get real-time updates.
**Example:**
```javascript
// In TimelinePage.vue
const importProgress = ref({ processed: 0, total: 0 })

async function triggerImport() {
  if (importRunning.value) return;
  importRunning.value = true;
  importProgress.value = { processed: 0, total: 0 };

  const source = new EventSource('/api/import/progress');

  source.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);
    importProgress.value = data;
  });

  source.addEventListener('complete', (e) => {
    source.close();
    importRunning.value = false;
    fetchTimeline();
  });

  source.addEventListener('error', (e) => {
    source.close();
    importRunning.value = false;
    // EventSource 'error' fires on connection issues too
    error.value = 'Import failed';
  });
}
```

### Anti-Patterns to Avoid

- **Polling loop:** Do NOT implement a separate status endpoint + setInterval polling. SSE is simpler, more efficient, and provides instant updates.
- **Storing progress in global state for polling:** Adds complexity for no benefit when SSE pushes directly.
- **Using POST for the SSE endpoint:** EventSource only supports GET. Keep POST /api/import as a non-streaming fallback.
- **Buffering all events then sending:** Each progress event must be written immediately with `raw.write()`, not collected.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE message formatting | Custom protocol | Standard SSE format (`event:...\ndata:...\n\n`) | Browser EventSource expects this exact format |
| Progress bar UI | New component | Existing AppProgressBar with value/max props | Already built, uses Reka UI, supports both modes |
| Connection lifecycle | Custom reconnect logic | EventSource built-in auto-reconnect | EventSource reconnects automatically on error |

**Key insight:** The browser's EventSource API handles reconnection, parsing, and event dispatching. The SSE wire format is trivial (text lines). No libraries needed on either side.

## Common Pitfalls

### Pitfall 1: Forgetting reply.hijack() in Fastify

**What goes wrong:** Without `reply.hijack()`, Fastify will try to send a response after the handler returns, conflicting with the SSE stream.
**Why it happens:** Fastify auto-sends responses. The handler must explicitly opt out.
**How to avoid:** Call `reply.hijack()` before writing to `reply.raw`.
**Warning signs:** "Reply was already sent" errors in logs.

### Pitfall 2: Missing double newline in SSE

**What goes wrong:** Events don't fire on the client.
**Why it happens:** SSE protocol requires `\n\n` to terminate each event. A single `\n` is a field separator.
**How to avoid:** Always end events with `\n\n`: `raw.write(`data: ${json}\n\n`)`.
**Warning signs:** EventSource `onmessage` never fires despite server writing data.

### Pitfall 3: Not handling client disconnect

**What goes wrong:** Import continues but `raw.write()` throws after client disconnects.
**Why it happens:** User navigates away or closes tab during import.
**How to avoid:** Listen for `request.raw.on('close')` and set a flag to skip `raw.write()` calls. The import itself should still complete (don't abort database work).
**Warning signs:** Unhandled write errors in server logs.

### Pitfall 4: EventSource GET conflicts with POST concurrency guard

**What goes wrong:** The SSE GET endpoint and the existing POST endpoint share the `importRunning` guard, but they use different mechanisms.
**Why it happens:** Two entry points to the same operation.
**How to avoid:** Both endpoints must check and set the same `importRunning` flag. The GET SSE endpoint becomes the primary import trigger; POST remains as a simple fallback.
**Warning signs:** 409 when using one endpoint after the other, or concurrent imports.

### Pitfall 5: Two-pass import restructuring

**What goes wrong:** To report total count, you need to know how many files will be imported BEFORE starting. The current code interleaves discovery and import per-project.
**Why it happens:** Current `importAll()` discovers files per-project then imports immediately.
**How to avoid:** Restructure to do discovery for ALL projects first (collecting toImport arrays), then import. This gives an accurate total count upfront.
**Warning signs:** Progress bar showing "3 of ?" or jumping when new project files are discovered.

### Pitfall 6: Progress percentage off due to agent files

**What goes wrong:** Agent files (Pattern A subagents) are also processed per-project but not counted in the initial total.
**Why it happens:** Agent files are discovered and processed in a separate loop after regular transcript files.
**How to avoid:** Include agent files in the total count during the discovery phase, or report them as a separate progress phase.
**Warning signs:** Progress reaches 100% then continues processing.

## Code Examples

### SSE Event Format (Wire Protocol)
```
event: progress
data: {"phase":"importing","processed":5,"total":42,"currentFile":"abc12345"}

event: progress
data: {"phase":"importing","processed":6,"total":42,"currentFile":"def67890"}

event: complete
data: {"projectsFound":3,"filesProcessed":42,"filesSkipped":10,"totalMessages":1234,"errors":[]}

```

### AppProgressBar with Determinate Values
```vue
<!-- In TimelineToolbar.vue -->
<div v-if="importRunning" class="progress-container">
  <AppProgressBar
    :value="importProgress.processed"
    :max="importProgress.total"
    :indeterminate="importProgress.total === 0"
  />
  <span class="progress-text">
    {{ importProgress.processed }} / {{ importProgress.total }}
  </span>
</div>
```

### Cleanup on Component Unmount
```javascript
// Store EventSource ref for cleanup
const importEventSource = ref(null);

onUnmounted(() => {
  importEventSource.value?.close();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling with setInterval | SSE / EventSource | Long-established | Push-based, lower latency, simpler code |
| WebSocket for all real-time | SSE for unidirectional | Growing trend | Simpler server, no ws library needed |
| Indeterminate spinners | Determinate progress bars | UX best practice | Users know how long to wait |

**Deprecated/outdated:**
- XMLHttpRequest-based streaming: Use EventSource instead
- `reply.sent = true` (Fastify <4): Use `reply.hijack()` in Fastify 5

## Open Questions

1. **Should the POST /api/import endpoint be kept?**
   - What we know: POST is currently the only import trigger. SSE requires GET.
   - What's unclear: Whether any non-browser client uses POST /api/import.
   - Recommendation: Keep POST as a non-streaming fallback, add GET /api/import/progress as the primary streaming endpoint. Frontend switches to GET.

2. **Should progress include per-session details (name/status list)?**
   - What we know: Success criteria #3 says "user can see which sessions have been imported, which are in progress, and which are pending."
   - What's unclear: How much detail to show in the UI (full list vs. just counts + current file name).
   - Recommendation: Start with counts + current session ID in progress events. A full list can be built client-side by accumulating events.

3. **Agent files in progress count**
   - What we know: Agent files are a separate loop in importAll(). They are usually fewer but still take time.
   - What's unclear: Whether to count them separately or combine with regular files.
   - Recommendation: Include agent files in the total count for simplicity. They process fast.

## Sources

### Primary (HIGH confidence)
- Fastify reply.hijack() documentation: https://fastify.dev/docs/latest/Reference/Reply/#hijack
- EventSource MDN (browser built-in): standard web API
- Codebase analysis: src/importer/index.js, src/server/routes/import.js, src/client/components/AppProgressBar.vue

### Secondary (MEDIUM confidence)
- Fastify SSE GitHub issue #1877: https://github.com/fastify/fastify/issues/1877 - confirms reply.hijack() + reply.raw pattern
- @fastify/sse plugin: https://github.com/fastify/sse - alternative approach (not recommended for this case)

### Tertiary (LOW confidence)
- Community blog posts on SSE patterns (general approach validated by multiple sources)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SSE is a well-established web standard, no new dependencies
- Architecture: HIGH - Pattern is straightforward, codebase structure is well understood
- Pitfalls: HIGH - Known gotchas from Fastify docs and SSE protocol spec

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable patterns, unlikely to change)
