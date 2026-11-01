<template>
  <main class="menu">
    <h1>BUILD ARENA</h1>
    <p>Construis, grimpe, survis.</p>
    <nav>
      <NuxtLink
        to="/play"
        class="btn primary"
      >Free Build</NuxtLink>
      <span
        class="btn disabled"
        title="Bientôt"
      >Duel contre un bot (bientôt)</span>
    </nav>
  </main>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  background: radial-gradient(circle at 50% 30%, #1d3a66, var(--bg) 70%);
}
h1 {
  margin: 0;
  font-size: clamp(42px, 8vw, 88px);
  font-weight: 900;
  letter-spacing: 4px;
  background: linear-gradient(180deg, #fff, var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
p {
  margin: 0 0 24px;
  opacity: 0.7;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 280px;
}
.btn {
  padding: 14px;
  text-align: center;
  font-weight: 700;
  text-decoration: none;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}
.btn.primary {
  color: #08121f;
  background: var(--accent);
}
.btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
