<template>
  <div class="session-detail-panel">
    <div class="detail-grid">
      <div class="detail-item">
        <span class="detail-label">Session ID</span>
        <span class="detail-value">{{ sessionIdShort || '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Ticket</span>
        <span class="detail-value">{{ session?.ticket || '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Branch</span>
        <span class="detail-value">{{ session?.branch || '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Project</span>
        <span class="detail-value">{{ (session && projectName) || '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Working Time</span>
        <span class="detail-value">{{ workingTimeLabel || '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Wall-Clock Span</span>
        <span class="detail-value">{{ wallClockSpan || '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Messages</span>
        <span class="detail-value">{{ session?.messageCount ?? '—' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Idle Gaps</span>
        <span class="detail-value">{{ session ? idleGapCount : '—' }}</span>
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
 * @prop {Object} session     - Session object or null
 * @prop {string} projectName - Display name of the project owning this session
 */
const props = defineProps({
  session: {
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

/** Working time formatted as "XX min" */
const workingTimeLabel = computed(() => {
  if (!props.session) return ''
  const minutes = Math.round(props.session.workingTimeMs / 60000)
  return `${minutes} min`
})

/** Wall-clock span: "HH:MM AM – HH:MM PM" */
const wallClockSpan = computed(() => {
  if (!props.session) return ''
  const opts = { hour: '2-digit', minute: '2-digit' }
  const start = new Date(props.session.startTime).toLocaleTimeString('en-US', opts)
  const end = new Date(props.session.endTime).toLocaleTimeString('en-US', opts)
  return `${start} – ${end}`
})

/** Number of idle gaps */
const idleGapCount = computed(() => {
  if (!props.session) return 0
  return props.session.idleGaps?.length ?? 0
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
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--spacing-sm);
  width: 100%;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
</style>
