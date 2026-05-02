<script lang="ts">
  export let open = false;
  export let running = false;
  export let result: string | null = null;
  export let onExecute: () => void;
</script>

{#if open}
  <section class="execute terminal-box">
    <div class="row">
      <strong>EXECUTE PIPELINE</strong>
      <button type="button" on:click={onExecute} disabled={running}>{running ? 'RUNNING...' : '実 行'}</button>
    </div>
    <pre>{result || 'No execution yet.'}</pre>
  </section>
{/if}

<style>
  .execute {
    margin-top: 0.9rem;
    padding: 0.9rem;
    border: 2px solid var(--nerv-orange);
    animation: panel-enter 0.2s ease;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.7rem;
  }

  strong {
    letter-spacing: 0.15em;
  }

  button {
    border: 1px solid var(--nerv-orange);
    background: transparent;
    color: var(--nerv-orange);
    padding: 0.4rem 1rem;
    letter-spacing: 0.14em;
    cursor: pointer;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    color: var(--nerv-green);
    min-height: 80px;
  }
</style>
