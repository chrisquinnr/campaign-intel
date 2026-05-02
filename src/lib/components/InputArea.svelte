<script lang="ts">
  export let question = '';
  export let running = false;
  export let onAsk: (question: string) => void;
</script>

<form
  class="input-area terminal-box"
  on:submit|preventDefault={() => {
    if (question.trim() && !running) onAsk(question.trim());
  }}
>
  <label for="question">QUESTION INPUT</label>
  <textarea
    id="question"
    bind:value={question}
    rows="4"
    placeholder="Example: Should we deploy this release today?"
  ></textarea>
  <button type="submit" disabled={running || !question.trim()}>{running ? '解析中...' : '送 信'}</button>
</form>

<style>
  .input-area {
    display: grid;
    gap: 0.55rem;
    padding: 0.8rem;
  }

  label {
    letter-spacing: 0.14em;
    font-size: 0.82rem;
  }

  textarea {
    width: 100%;
    background: var(--nerv-input-bg);
    color: var(--nerv-orange);
    border: 1px solid var(--nerv-orange);
    resize: vertical;
    padding: 0.6rem;
  }

  button {
    justify-self: end;
    background: transparent;
    color: var(--nerv-orange);
    border: 1px solid var(--nerv-orange);
    padding: 0.38rem 0.8rem;
    letter-spacing: 0.12em;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
