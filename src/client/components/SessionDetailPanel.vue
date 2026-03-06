<template>
  <div class="session-detail-panel">
    <div class="detail-grid">
      <!-- Column 1: Session identity -->
      <div class="detail-item">
        <span class="detail-label">Session Name:</span>
        <span class="detail-value">{{ session?.customTitle || '\u00A0' }}</span>
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
      <div class="detail-item">
        <span class="detail-label">Ticket:</span>
        <span class="detail-value">{{ session?.ticket || '\u00A0' }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Branch:</span>
        <span class="detail-value">{{ session?.branch || '\u00A0' }}</span>
      </div>

      <!-- Column 3: Timing -->
      <div class="detail-item">
        <span class="detail-label">Working Time:</span>
        <span class="detail-value">{{ workingTimeLabel || '\u00A0' }}</span>
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
 * @prop {Object} session     - Session object or null
 * @prop {string} projectName - Display name of the project owning this session
 */
defineEmits(['show-messages'])

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
</style>
