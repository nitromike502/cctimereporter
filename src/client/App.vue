<template>
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
