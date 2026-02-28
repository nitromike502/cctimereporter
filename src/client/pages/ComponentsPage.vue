<template>
  <div class="components-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Components</span>
      </div>
      <nav class="sidebar-nav">
        <a
          v-for="comp in components"
          :key="comp.id"
          href="#"
          class="sidebar-link"
          :class="{ 'is-active': active === comp.id }"
          @click.prevent="active = comp.id"
        >
          {{ comp.label }}
        </a>
      </nav>
    </aside>

    <!-- Main area -->
    <main class="main-area">

      <!-- ===== BUTTON SHOWCASE ===== -->
      <section v-if="active === 'button'" class="showcase-section">
        <h2 class="showcase-heading">Button</h2>
        <p class="showcase-description">
          Native <code>&lt;button&gt;</code> element with variant, size, disabled, and loading props.
        </p>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Variants</h3>
          <div class="showcase-row">
            <AppButton variant="primary">Primary</AppButton>
            <AppButton variant="secondary">Secondary</AppButton>
            <AppButton variant="ghost">Ghost</AppButton>
          </div>
        </div>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Sizes</h3>
          <div class="showcase-row">
            <AppButton size="sm">Small</AppButton>
            <AppButton size="md">Medium</AppButton>
            <AppButton size="lg">Large</AppButton>
          </div>
        </div>

        <div class="showcase-group">
          <h3 class="showcase-subheading">States</h3>
          <div class="showcase-row">
            <AppButton :disabled="true">Disabled</AppButton>
            <AppButton :loading="true">Loading</AppButton>
            <AppButton variant="secondary" :disabled="true">Secondary Disabled</AppButton>
            <AppButton variant="ghost" :loading="true">Ghost Loading</AppButton>
          </div>
        </div>
      </section>

      <!-- ===== BADGE SHOWCASE ===== -->
      <section v-if="active === 'badge'" class="showcase-section">
        <h2 class="showcase-heading">Badge</h2>
        <p class="showcase-description">
          Inline tag for status indicators and category labels.
        </p>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Variants</h3>
          <div class="showcase-row">
            <AppBadge variant="default">Default</AppBadge>
            <AppBadge variant="success">Success</AppBadge>
            <AppBadge variant="danger">Danger</AppBadge>
            <AppBadge variant="muted">Muted</AppBadge>
          </div>
        </div>

        <div class="showcase-group">
          <h3 class="showcase-subheading">In Context</h3>
          <div class="showcase-row">
            <span class="inline-example">
              Session status: <AppBadge variant="success">Active</AppBadge>
            </span>
            <span class="inline-example">
              Import status: <AppBadge variant="danger">Failed</AppBadge>
            </span>
            <span class="inline-example">
              Ticket: <AppBadge variant="default">AILASUP-123</AppBadge>
            </span>
            <span class="inline-example">
              Branch: <AppBadge variant="muted">No ticket</AppBadge>
            </span>
          </div>
        </div>
      </section>

      <!-- ===== CHECKBOX SHOWCASE ===== -->
      <section v-if="active === 'checkbox'" class="showcase-section">
        <h2 class="showcase-heading">Checkbox</h2>
        <p class="showcase-description">
          Accessible checkbox wrapping Reka UI <code>CheckboxRoot</code>. Supports v-model, label, and disabled.
        </p>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Interactive</h3>
          <div class="showcase-row">
            <AppCheckbox v-model="checkA" label="Unchecked by default" />
            <AppCheckbox v-model="checkB" label="Checked by default" />
            <AppCheckbox v-model="checkC" label="No label" />
          </div>
        </div>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Disabled States</h3>
          <div class="showcase-row">
            <AppCheckbox :model-value="false" :disabled="true" label="Disabled unchecked" />
            <AppCheckbox :model-value="true" :disabled="true" label="Disabled checked" />
          </div>
        </div>
      </section>

      <!-- ===== TOOLTIP SHOWCASE ===== -->
      <section v-if="active === 'tooltip'" class="showcase-section">
        <h2 class="showcase-heading">Tooltip</h2>
        <p class="showcase-description">
          Accessible tooltip wrapping Reka UI primitives. Hover any button to reveal its tooltip.
          Trigger element is passed via the default slot.
        </p>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Positions</h3>
          <div class="showcase-row">
            <AppTooltip content="Tooltip on top" side="top">
              <AppButton variant="secondary">Top</AppButton>
            </AppTooltip>
            <AppTooltip content="Tooltip on bottom" side="bottom">
              <AppButton variant="secondary">Bottom</AppButton>
            </AppTooltip>
            <AppTooltip content="Tooltip on left" side="left">
              <AppButton variant="secondary">Left</AppButton>
            </AppTooltip>
            <AppTooltip content="Tooltip on right" side="right">
              <AppButton variant="secondary">Right</AppButton>
            </AppTooltip>
          </div>
        </div>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Long Content</h3>
          <div class="showcase-row">
            <AppTooltip
              content="This tooltip has longer text to demonstrate how content wraps at the max-width of 250px when it exceeds a single line."
              side="top"
            >
              <AppButton variant="secondary">Long Tooltip</AppButton>
            </AppTooltip>
            <AppTooltip content="Non-interactive badge tooltip" side="right">
              <span style="cursor: default;">
                <AppBadge variant="default">Hover me</AppBadge>
              </span>
            </AppTooltip>
          </div>
        </div>
      </section>

      <!-- ===== PROGRESS BAR SHOWCASE ===== -->
      <section v-if="active === 'progress'" class="showcase-section">
        <h2 class="showcase-heading">ProgressBar</h2>
        <p class="showcase-description">
          Accessible progress bar wrapping Reka UI <code>ProgressRoot</code>.
          Supports <code>value</code>, <code>max</code>, and <code>indeterminate</code> props.
        </p>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Values</h3>
          <div class="showcase-column">
            <div v-for="pct in [0, 25, 50, 75, 100]" :key="pct" class="progress-row">
              <span class="progress-label">{{ pct }}%</span>
              <AppProgressBar :value="pct" :max="100" />
            </div>
          </div>
        </div>

        <div class="showcase-group">
          <h3 class="showcase-subheading">Indeterminate</h3>
          <div class="showcase-column">
            <div class="progress-row">
              <span class="progress-label">Loading...</span>
              <AppProgressBar :indeterminate="true" />
            </div>
          </div>
        </div>
      </section>

    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import AppButton from '../components/AppButton.vue'
import AppBadge from '../components/AppBadge.vue'
import AppCheckbox from '../components/AppCheckbox.vue'
import AppTooltip from '../components/AppTooltip.vue'
import AppProgressBar from '../components/AppProgressBar.vue'

/** Sidebar component registry */
const components = [
  { id: 'button', label: 'Button' },
  { id: 'badge', label: 'Badge' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'tooltip', label: 'Tooltip' },
  { id: 'progress', label: 'ProgressBar' },
]

/** Currently active component in the sidebar */
const active = ref('button')

/** Interactive checkbox states for the showcase */
const checkA = ref(false)
const checkB = ref(true)
const checkC = ref(false)
</script>

<style scoped>
/* ====== Layout ====== */
.components-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}

/* ====== Sidebar ====== */
.sidebar {
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.sidebar-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sidebar-nav {
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-link {
  display: block;
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-body-text);
  text-decoration: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-family: var(--font-family);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.sidebar-link:hover {
  background: var(--color-bg);
  color: var(--color-heading);
}

.sidebar-link.is-active {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-heading);
  font-weight: 600;
}

/* ====== Main area ====== */
.main-area {
  padding: var(--spacing-xl);
  overflow-y: auto;
}

/* ====== Showcase sections ====== */
.showcase-section {
  max-width: 720px;
}

.showcase-heading {
  font-size: var(--font-size-2xl);
  color: var(--color-heading);
  font-family: var(--font-family);
  margin-bottom: var(--spacing-sm);
}

.showcase-description {
  font-size: var(--font-size-base);
  color: var(--color-muted);
  margin-bottom: var(--spacing-lg);
  line-height: 1.6;
}

.showcase-description code {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  background: var(--color-bg-secondary);
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.showcase-group {
  margin-bottom: var(--spacing-lg);
}

.showcase-subheading {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-sm);
  font-family: var(--font-family);
}

.showcase-row {
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  flex-wrap: wrap;
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

/* ====== Inline badge context examples ====== */
.inline-example {
  font-size: var(--font-size-sm);
  color: var(--color-body-text);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
}

/* ====== Progress bar showcase ====== */
.showcase-column {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.progress-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: var(--spacing-md);
}

.progress-label {
  font-size: var(--font-size-sm);
  color: var(--color-muted);
  font-family: var(--font-mono);
  text-align: right;
}
</style>
