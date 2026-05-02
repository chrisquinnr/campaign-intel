<script lang="ts">
  import type { ConsensusStatus } from '$lib/types';

  export let status: ConsensusStatus = 'pending';

  const labelMap: Record<ConsensusStatus, string> = {
    pending: '判 定',
    info: '情 報',
    yes: '合 意',
    no: '拒 絶',
    conditional: '状 態',
    error: '誤 差'
  };

  const colorMap: Record<ConsensusStatus, string> = {
    pending: '#ff8d00',
    info: '#3caee0',
    yes: '#52e691',
    no: '#a41413',
    conditional: '#ff8d00',
    error: '#9a9a9a'
  };
</script>

<section class="response terminal-box" style={`--status-color:${colorMap[status]};`}>
  <div class="inner">
    <span class="kanji">{labelMap[status]}</span>
    <span class="english">{status.toUpperCase()}</span>
    {#if status === 'conditional'}
      <div class="conditional-bar"></div>
    {/if}
  </div>
</section>

<style>
  .response {
    border: 3px double var(--status-color);
    padding: 0.8rem;
    min-height: 112px;
    display: grid;
    gap: 0.6rem;
  }

  .inner {
    border: 1px solid var(--status-color);
    padding: 0.75rem;
    display: grid;
    gap: 0.25rem;
    justify-items: center;
  }

  .kanji {
    font-size: clamp(1.4rem, 4vw, 2.6rem);
    color: var(--status-color);
    font-family: var(--font-display);
    letter-spacing: 0.2em;
  }

  .english {
    font-size: 0.82rem;
    letter-spacing: 0.2em;
  }

  .conditional-bar {
    width: 100%;
    height: 14px;
    background: var(--nerv-conditional);
  }
</style>
