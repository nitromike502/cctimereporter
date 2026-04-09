<template>
  <nav class="app-nav">
    <RouterLink class="nav-link" to="/timeline">Timeline</RouterLink>
    <RouterLink class="nav-link" to="/tokens">Tokens</RouterLink>
  </nav>
  <RouterView />
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  color: var(--color-body-text);
  background: var(--color-bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
.app-nav {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.nav-link {
  font-size: var(--font-size-sm);
  color: var(--color-link);
  text-decoration: none;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.nav-link:hover {
  background: color-mix(in srgb, var(--color-link) 10%, transparent);
}

.nav-link.router-link-active {
  background: var(--color-bg);
  color: var(--color-heading);
  font-weight: 600;
}
</style>
