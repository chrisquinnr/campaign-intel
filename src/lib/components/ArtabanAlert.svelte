<script lang="ts">
  import type { ArtabanVerdict } from '$lib/types';

  export let verdict: ArtabanVerdict;
  export let concern: string = '';
  export let reasoning: string = '';
  export let streaming: boolean = false;

  $: isPause    = verdict === 'pause';
  $: isEscalate = verdict === 'escalate';
  $: isDecidedYes = verdict === 'yes';
  $: isDecidedNo  = verdict === 'no';
  $: isDeciding   = isDecidedYes || isDecidedNo;

  // NGE-style classification labels
  $: patternCode  = isEscalate || isDecidedNo ? 'PATTERN:RED'
                  : isDecidedYes              ? 'PATTERN:GREEN'
                  : 'PATTERN:ORANGE';
  $: riskLevel    = isEscalate   ? 'CRITICAL — EXECUTION SUSPENDED'
                  : isDecidedNo  ? 'DECISIVE VOTE — EXECUTION REFUSED'
                  : isDecidedYes ? 'DECISIVE VOTE — PROCEED AUTHORIZED'
                  : 'ELEVATED — DELIBERATION REQUIRED';
  $: headerLabel  = isEscalate   ? 'ARTABAN PROTOCOL // ESCALATION'
                  : isDecidedNo  ? 'ARTABAN PROTOCOL // DECIDED: NO'
                  : isDecidedYes ? 'ARTABAN PROTOCOL // DECIDED: YES'
                  : 'ARTABAN PROTOCOL // PAUSE';
</script>

<div class="artaban-wrap" class:escalate={isEscalate || isDecidedNo} class:pause={isPause} class:decided-yes={isDecidedYes} role="alert" aria-live="assertive">

  <!-- Stripe header bar (diagonal warning pattern) -->
  <div class="stripe-bar" aria-hidden="true"></div>

  <!-- Main alert body -->
  <div class="alert-body">

    <!-- Header row -->
    <div class="alert-header">
      <div class="alert-sigil" aria-hidden="true">⬡</div>
      <div class="alert-titles">
        <span class="alert-codename">ARTABAN-4</span>
        <span class="alert-header-text">{headerLabel}</span>
      </div>
      <div class="alert-pattern-code">{patternCode}</div>
    </div>

    <!-- Risk classification -->
    <div class="alert-classification">
      <span class="class-label">RISK</span>
      <span class="class-value">{riskLevel}</span>
    </div>

    <!-- Concern (if present) -->
    {#if concern}
      <div class="alert-concern">
        <span class="concern-label">CONCERN //</span>
        <span class="concern-text">{concern}</span>
      </div>
    {/if}

    <!-- Streaming reasoning -->
    {#if reasoning || streaming}
      <div class="alert-reasoning">
        {reasoning}<span class="cursor" class:visible={streaming}>█</span>
      </div>
    {/if}

  </div>

  <!-- Stripe footer bar -->
  <div class="stripe-bar" aria-hidden="true"></div>

</div>

<style>
  /* ── Variables ────────────────────────────────────────── */
  .artaban-wrap {
    --ac: #ff8d00;      /* amber for pause  */
    --ac-dim: rgba(255, 141, 0, 0.15);
    --ac-border: rgba(255, 141, 0, 0.7);
    --stripe-a: rgba(255, 141, 0, 0.18);
    --stripe-b: transparent;
  }
  .artaban-wrap.escalate {
    --ac: #cc2211;
    --ac-dim: rgba(204, 34, 17, 0.15);
    --ac-border: rgba(204, 34, 17, 0.75);
    --stripe-a: rgba(204, 34, 17, 0.22);
    --stripe-b: transparent;
  }
  .artaban-wrap.decided-yes {
    --ac: #00bb77;
    --ac-dim: rgba(0, 187, 119, 0.12);
    --ac-border: rgba(0, 187, 119, 0.65);
    --stripe-a: rgba(0, 187, 119, 0.16);
    --stripe-b: transparent;
  }

  /* ── Outer wrapper ───────────────────────────────────── */
  .artaban-wrap {
    width: 100%;
    background: #0a0800;
    border: 1px solid var(--ac-border);
    font-family: var(--font-body, monospace);
    animation: artaban-appear 0.35s ease-out;
    overflow: hidden;
  }

  .escalate {
    animation: artaban-appear 0.35s ease-out, escalate-flash 0.9s ease-in-out 3;
  }

  .decided-yes {
    animation: artaban-appear 0.35s ease-out, decided-yes-pulse 1.1s ease-in-out 2;
  }

  @keyframes artaban-appear {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes escalate-flash {
    0%, 100% { border-color: rgba(204, 34, 17, 0.75); }
    50%       { border-color: rgba(204, 34, 17, 1); box-shadow: 0 0 18px rgba(204, 34, 17, 0.5); }
  }

  @keyframes decided-yes-pulse {
    0%, 100% { border-color: rgba(0, 187, 119, 0.65); }
    50%       { border-color: rgba(0, 187, 119, 1); box-shadow: 0 0 14px rgba(0, 187, 119, 0.4); }
  }

  /* ── Diagonal warning stripes ────────────────────────── */
  .stripe-bar {
    height: 8px;
    background: repeating-linear-gradient(
      -45deg,
      var(--stripe-a) 0px,
      var(--stripe-a) 6px,
      var(--stripe-b) 6px,
      var(--stripe-b) 12px
    );
  }

  /* ── Alert body ─────────────────────────────────────── */
  .alert-body {
    padding: 0.6rem 0.9rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* ── Header row ─────────────────────────────────────── */
  .alert-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .alert-sigil {
    color: var(--ac);
    font-size: 1.1rem;
    line-height: 1;
    flex-shrink: 0;
    animation: sigil-pulse 1.8s ease-in-out infinite;
  }

  .escalate .alert-sigil {
    animation: sigil-pulse 0.7s ease-in-out infinite;
  }

  @keyframes sigil-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }

  .alert-titles {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.05em;
  }

  .alert-codename {
    color: var(--ac);
    font-family: var(--font-display, monospace);
    font-size: 0.65rem;
    letter-spacing: 0.25em;
    opacity: 0.75;
  }

  .alert-header-text {
    color: var(--ac);
    font-family: var(--font-display, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.15em;
    font-weight: 700;
  }

  .alert-pattern-code {
    color: var(--ac);
    font-family: var(--font-display, monospace);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    opacity: 0.65;
    flex-shrink: 0;
    border: 1px solid var(--ac-border);
    padding: 0.15em 0.4em;
  }

  /* ── Risk classification ─────────────────────────────── */
  .alert-classification {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 0.4rem;
  }

  .class-label {
    color: var(--ac);
    font-family: var(--font-display, monospace);
    font-size: 0.6rem;
    letter-spacing: 0.22em;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .class-value {
    color: var(--ac);
    font-family: var(--font-display, monospace);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
  }

  /* ── Concern ─────────────────────────────────────────── */
  .alert-concern {
    background: var(--ac-dim);
    border-left: 3px solid var(--ac);
    padding: 0.4rem 0.6rem;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .concern-label {
    color: var(--ac);
    font-family: var(--font-display, monospace);
    font-size: 0.6rem;
    letter-spacing: 0.2em;
    flex-shrink: 0;
  }

  .concern-text {
    color: #f0d080;
    font-size: 0.8rem;
    line-height: 1.4;
    letter-spacing: 0.04em;
  }

  /* ── Reasoning ───────────────────────────────────────── */
  .alert-reasoning {
    color: rgba(240, 208, 128, 0.75);
    font-size: 0.75rem;
    line-height: 1.6;
    letter-spacing: 0.03em;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 0.4rem;
    white-space: pre-wrap;
  }

  /* ── Streaming cursor ────────────────────────────────── */
  .cursor {
    display: inline-block;
    color: var(--ac);
    opacity: 0;
    animation: none;
  }
  .cursor.visible {
    opacity: 1;
    animation: blink 0.7s step-end infinite;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }
</style>
