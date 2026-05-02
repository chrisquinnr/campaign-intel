<script lang="ts">
  export let phase = 0;
  export let exMode = false;
</script>

<aside class="status terminal-box">
  <div>CODE:473</div>
  <div>FILE:MAGI_SYS</div>
  <div>PHASE:{phase}/5</div>
  <div>EX_MODE:{exMode ? 'ON' : 'OFF'}</div>
</aside>

<style>
  .status {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    padding: 0.75rem;
    letter-spacing: 0.1em;
    font-size: 0.82rem;
    color: var(--nerv-green);
  }
</style>
