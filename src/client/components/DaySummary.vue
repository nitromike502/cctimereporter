<template>
  <div class="day-summary">
    <p class="summary-total">
      Total working time: <strong>{{ formatWorkingTime(totalWorkingMs) }}</strong>
    </p>

    <TabsRoot default-value="project">
      <TabsList class="tabs-list">
        <TabsTrigger value="project" class="tab-trigger">By Project</TabsTrigger>
        <TabsTrigger value="ticket" class="tab-trigger">By Ticket</TabsTrigger>
        <TabsTrigger value="branch" class="tab-trigger">By Branch</TabsTrigger>
      </TabsList>

      <TabsContent value="project">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Project</th>
              <th class="col-right">Sessions</th>
              <th class="col-right">Working Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in projectRows" :key="row.displayName">
              <td>{{ row.displayName }}</td>
              <td class="col-right">{{ row.sessionCount }}</td>
              <td class="col-right">{{ formatWorkingTime(row.workingTimeMs) }}</td>
            </tr>
          </tbody>
        </table>
      </TabsContent>

      <TabsContent value="ticket">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th class="col-right">Sessions</th>
              <th class="col-right">Working Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in ticketRows" :key="row.ticket ?? '__none__'">
              <td>{{ row.ticket ?? '(untracked)' }}</td>
              <td class="col-right">{{ row.sessionCount }}</td>
              <td class="col-right">{{ formatWorkingTime(row.workingTimeMs) }}</td>
            </tr>
          </tbody>
        </table>
      </TabsContent>

      <TabsContent value="branch">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th class="col-right">Sessions</th>
              <th class="col-right">Working Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in branchRows" :key="row.branch ?? '__none__'">
              <td>{{ row.branch ?? '(untracked)' }}</td>
              <td class="col-right">{{ row.sessionCount }}</td>
              <td class="col-right">{{ formatWorkingTime(row.workingTimeMs) }}</td>
            </tr>
          </tbody>
        </table>
      </TabsContent>
    </TabsRoot>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'

const props = defineProps({
  projects: {
    type: Array,
    required: true,
  },
})

function formatWorkingTime(ms) {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * Groups sessions by a key function and returns a Map<key, session[]>.
 * Null/undefined keys are preserved as null.
 */
function groupBy(sessions, keyFn) {
  const map = new Map()
  for (const session of sessions) {
    const key = keyFn(session)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(session)
  }
  return map
}

const allSessions = computed(() =>
  props.projects.flatMap(p => p.sessions)
)

const totalWorkingMs = computed(() =>
  allSessions.value.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0)
)

const projectRows = computed(() =>
  props.projects
    .map(p => ({
      displayName: p.displayName,
      sessionCount: p.sessions.length,
      workingTimeMs: p.sessions.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0),
    }))
    .sort((a, b) => b.workingTimeMs - a.workingTimeMs)
)

const ticketRows = computed(() => {
  const grouped = groupBy(allSessions.value, s => s.ticket || null)
  const rows = []
  let nullRow = null

  for (const [ticket, sessions] of grouped) {
    const row = {
      ticket,
      sessionCount: sessions.length,
      workingTimeMs: sessions.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0),
    }
    if (ticket === null) {
      nullRow = row
    } else {
      rows.push(row)
    }
  }

  rows.sort((a, b) => b.workingTimeMs - a.workingTimeMs)
  if (nullRow) rows.push(nullRow)
  return rows
})

const branchRows = computed(() => {
  const grouped = groupBy(allSessions.value, s => s.branch || null)
  const rows = []
  let nullRow = null

  for (const [branch, sessions] of grouped) {
    const row = {
      branch,
      sessionCount: sessions.length,
      workingTimeMs: sessions.reduce((sum, s) => sum + (s.workingTimeMs ?? 0), 0),
    }
    if (branch === null) {
      nullRow = row
    } else {
      rows.push(row)
    }
  }

  rows.sort((a, b) => b.workingTimeMs - a.workingTimeMs)
  if (nullRow) rows.push(nullRow)
  return rows
})
</script>

<style scoped>
.day-summary {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.summary-total {
  font-size: var(--font-size-md, var(--font-size-base));
  color: var(--color-heading);
  margin-bottom: var(--spacing-md);
  margin-top: 0;
}

.tabs-list {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--spacing-sm);
}

.tab-trigger {
  padding: var(--spacing-xs) var(--spacing-md);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  color: var(--color-muted);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
  margin-bottom: -1px;
}

.tab-trigger[data-state="active"] {
  color: var(--color-heading);
  border-bottom-color: var(--color-primary);
}

.tab-trigger:hover:not([data-state="active"]) {
  color: var(--color-body-text);
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.summary-table th {
  text-align: left;
  padding: var(--spacing-xs) var(--spacing-sm);
  color: var(--color-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--color-border);
}

.summary-table td {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
}

.col-right {
  text-align: right;
}
</style>
