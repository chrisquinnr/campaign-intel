<script lang="ts">
  export let open = false;
  export let title = '';
  export let content = '';
  export let onClose: () => void;
</script>

{#if open}
  <div class="backdrop" role="button" tabindex="0" on:click={onClose} on:keydown={(e) => e.key === 'Escape' && onClose()}>
    <section class="modal terminal-box" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      <header>
        <h3>{title}</h3>
        <button type="button" on:click={onClose}>X</button>
      </header>
      <pre>{content}</pre>
    </section>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: grid;
    place-items: center;
    z-index: 200;
  }

  .modal {
    width: min(900px, 94vw);
    max-height: 80vh;
    overflow: auto;
    border: 2px solid var(--nerv-orange);
    padding: 1rem;
    animation: panel-enter 0.2s ease;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  h3 {
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: 0.1em;
  }

  button {
    border: 1px solid var(--nerv-orange);
    background: transparent;
    color: var(--nerv-orange);
    padding: 0.2rem 0.5rem;
    cursor: pointer;
  }

  pre {
    white-space: pre-wrap;
    margin: 0.8rem 0 0;
  }
</style>
