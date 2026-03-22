<template>
  <div class="session-detail-panel">
    <!-- Fork detail view: shown when a fork bar is selected -->
    <div v-if="fork" class="detail-grid detail-grid--fork">
      <!-- Column 1: Fork identity -->
      <div class="detail-item">
        <span class="detail-label">Fork Branch:</span>
        <span class="detail-value" :title="fork.forkBranchId">{{ forkBranchIdShort }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Parent Session:</span>
        <span class="detail-value" :title="fork.sessionId">{{ forkParentIdShort }}</span>
      </div>

      <!-- Column 2: Timing -->
      <div class="detail-item">
        <span class="detail-label">Start:</span>
        <span class="detail-value">{{ forkStartDateTime || '\u00A0' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">End:</span>
        <span class="detail-value">{{ forkEndDateTime || '\u00A0' }}</span>
      </div>

      <!-- Column 3: Stats -->
      <div class="detail-item">
        <span class="detail-label">Messages:</span>
        <span class="detail-value">{{ fork.messageCount ?? '\u00A0' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Type:</span>
        <span class="detail-value fork-type-badge">Fork Branch</span>
      </div>
    </div>

    <!-- Session detail view: shown when a session bar is selected -->
    <div v-else class="detail-grid">
      <!-- Column 1: Session identity -->
      <div class="detail-item detail-item--editable">
        <span class="detail-label">Session Name:</span>
        <span class="detail-value">
          {{ session?.userLabel || session?.customTitle || '\u00A0' }}
          <span v-if="session?.userLabel" class="custom-indicator" title="Custom name"></span>
        </span>
        <button
          v-if="session"
          class="edit-btn"
          @click.stop="$emit('edit')"
          aria-label="Edit session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            <path d="m15 5 4 4"/>
          </svg>
        </button>
      </div>
      <div class="detail-item">
        <span class="detail-label">Session ID:</span>
        <span class="detail-value" :title="session?.sessionId">{{ sessionIdShort || '\u00A0' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Messages:</span>
        <span class="detail-value">
          {{ session?.messageCount ?? '\u00A0' }}
          <a
            v-if="session"
            class="detail-link"
            href="#"
            @click.prevent="$emit('show-messages')"
          >view</a>
        </span>
      </div>

      <!-- Column 2: Context -->
      <div class="detail-item">
        <span class="detail-label">Project:</span>
        <span class="detail-value">{{ (session && projectName) || '\u00A0' }}</span>
      </div>
      <div class="detail-item detail-item--editable">
        <span class="detail-label">Ticket:</span>
        <span class="detail-value">
          {{ (session?.userTicket || session?.ticket) || '\u00A0' }}
          <span v-if="session?.userTicket" class="custom-indicator" title="Custom ticket"></span>
        </span>
        <button
          v-if="session"
          class="edit-btn"
          @click.stop="$emit('edit')"
          aria-label="Edit session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            <path d="m15 5 4 4"/>
          </svg>
        </button>
      </div>
      <div class="detail-item">
        <span class="detail-label">Branch:</span>
        <span class="detail-value">{{ session?.branch || '\u00A0' }}</span>
      </div>

      <!-- Column 3: Timing -->
      <div class="detail-item">
        <span class="detail-label">Working Time:</span>
        <span class="detail-value">
          {{ workingTimeLabel || '\u00A0' }}
          <span v-if="session && elapsedTimeLabel" class="elapsed-time">/ {{ elapsedTimeLabel }} elapsed</span>
        </span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Start:</span>
        <span class="detail-value">{{ startDateTime || '\u00A0' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">End:</span>
        <span class="detail-value">{{ endDateTime || '\u00A0' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * SessionDetailPanel — AWS Console-style persistent detail panel.
 *
 * Shows a placeholder when no session is selected. When a session is selected,
 * renders a horizontal key-value grid with all session details.
 *
 * When a fork bar is selected (fork prop is non-null), renders a fork-specific
 * layout showing branch ID, parent session, time range, and message count.
 *
 * @prop {Object} session     - Session object or null
 * @prop {Object} fork        - Fork segment object or null (takes priority over session view)
 * @prop {string} projectName - Display name of the project owning this session
 */
defineEmits(['show-messages', 'edit'])

const props = defineProps({
  session: {
    type: Object,
    default: null,
  },
  fork: {
    type: Object,
    default: null,
  },
  projectName: {
    type: String,
    default: '',
  },
})

/** Abbreviated session ID: first 12 chars + ellipsis */
const sessionIdShort = computed(() => {
  if (!props.session) return ''
  return props.session.sessionId.slice(0, 12) + '...'
})

/** Abbreviated fork branch ID: first 12 chars + ellipsis */
const forkBranchIdShort = computed(() => {
  if (!props.fork?.forkBranchId) return ''
  return props.fork.forkBranchId.slice(0, 12) + '...'
})

/** Abbreviated fork parent session ID: first 12 chars + ellipsis */
const forkParentIdShort = computed(() => {
  if (!props.fork?.sessionId) return ''
  return props.fork.sessionId.slice(0, 12) + '...'
})

/**
 * Format a duration in milliseconds as a human-readable string.
 * Uses "Xh Ym" for >= 1 hour, "X min" otherwise.
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 min'
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Working time formatted as "XX min" or "Xh Ym" */
const workingTimeLabel = computed(() => {
  if (!props.session) return ''
  return formatDuration(props.session.workingTimeMs)
})

/** Elapsed wall-clock time formatted as "XX min" or "Xh Ym" */
const elapsedTimeLabel = computed(() => {
  if (!props.session?.elapsedTimeMs) return ''
  return formatDuration(props.session.elapsedTimeMs)
})

/** Format a datetime as "HH:MM AM, Mon DD" */
function formatDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${time}, ${date}`
}

/** Session start datetime */
const startDateTime = computed(() => {
  if (!props.session) return ''
  return formatDateTime(props.session.startTime)
})

/** Session end datetime */
const endDateTime = computed(() => {
  if (!props.session) return ''
  return formatDateTime(props.session.endTime)
})

/** Fork start datetime */
const forkStartDateTime = computed(() => {
  if (!props.fork) return ''
  return formatDateTime(props.fork.startTime)
})

/** Fork end datetime */
const forkEndDateTime = computed(() => {
  if (!props.fork) return ''
  return formatDateTime(props.fork.endTime)
})
</script>

<style scoped>
.session-detail-panel {
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: 48px;
  display: flex;
  align-items: center;
}

.detail-placeholder {
  font-size: var(--font-size-sm);
  color: var(--color-muted);
  font-style: italic;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, auto);
  grid-auto-flow: column;
  gap: var(--spacing-xs) var(--spacing-lg);
  width: 100%;
}

/* Fork view uses 2 rows (6 items across 3 columns) */
.detail-grid--fork {
  grid-template-rows: repeat(2, auto);
}

.detail-item {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.detail-label {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  font-size: var(--font-size-sm);
  color: var(--color-heading);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-link {
  font-size: var(--font-size-xs);
  color: var(--color-link);
  margin-left: var(--spacing-xs);
  text-decoration: none;
}

.detail-link:hover {
  text-decoration: underline;
}

.detail-item--editable {
  position: relative;
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity var(--transition-fast), color var(--transition-fast);
  margin-left: var(--spacing-xs);
  vertical-align: middle;
}

.detail-item--editable:hover .edit-btn {
  opacity: 1;
}

.edit-btn:hover {
  color: var(--color-link);
  background: var(--color-bg);
}

.custom-indicator {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-link);
  margin-left: var(--spacing-xs);
  vertical-align: middle;
}

.elapsed-time {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  font-weight: 400;
  margin-left: var(--spacing-xs);
}

.fork-type-badge {
  font-size: var(--font-size-xs);
  color: var(--color-muted);
  font-weight: 400;
  font-style: italic;
}
</style>
