<script lang="ts">
  import type { AgentName, AnswerStatus, ConsensusStatus } from '$lib/types';

  export let running = false;
  export let agentStatuses: Record<AgentName, AnswerStatus> = {
    melchior: 'pending',
    balthasar: 'pending',
    casper: 'pending'
  };
  export let consensus: { status: ConsensusStatus; canExecute: boolean } = {
    status: 'pending',
    canExecute: false
  };
  export let onAgentClick: (agent: AgentName) => void = () => {};

  const statusColors: Record<string, string> = {
    pending:     '#ffd600',
    yes:         '#52e691',
    no:          '#cc2211',
    conditional: '#ff8d00',
    info:        '#3caee0',
    error:       '#888888'
  };

  const statusKanji: Record<string, string> = {
    pending:     '待 機',
    yes:         '合 意',
    no:          '反 対',
    conditional: '保 留',
    info:        '情 報',
    error:       '誤 差'
  };

  const consensusKanji: Record<ConsensusStatus, string> = {
    pending:     '審議中',
    yes:         '可 決',
    no:          '否 決',
    conditional: '条件付',
    info:        '情 報',
    error:       '誤 差'
  };

  const agentDelays: Record<AgentName, string> = {
    melchior: '0s',
    casper: '-0.4s',
    balthasar: '-0.8s'
  };

  $: mc = statusColors[agentStatuses.melchior] ?? '#ffd600';
  $: bc = statusColors[agentStatuses.balthasar] ?? '#ffd600';
  $: cc = statusColors[agentStatuses.casper] ?? '#ffd600';
  $: hc = statusColors[consensus.status] ?? '#ffd600';
</script>

<div class="arena" style="container-type: size;">

  <!--
    Three black trapezoidal fan-blades (click targets only — no text inside,
    to avoid clip-path clipping of counter-rotated text).

    Layout:
      width 44%, height 44%, left 28%, top 6%
      → bottom-center sits at arena center (50%, 50%)
      transform-origin: center bottom → rotates around arena center.
      clip-path: trapezoid, wider at outer end (top), narrower at inner end (bottom).
      Rotations: Melchior 0° (up), Casper 120° (lower-right), Balthasar 240° (lower-left)
  -->
  <button
    class="blade blade-melchior"
    class:pulsing={running}
    style="--delay:{agentDelays.melchior};"
    on:click={() => onAgentClick('melchior')}
    aria-label="MELCHIOR-1 — {agentStatuses.melchior}"
  ></button>

  <button
    class="blade blade-casper"
    class:pulsing={running}
    style="--delay:{agentDelays.casper};"
    on:click={() => onAgentClick('casper')}
    aria-label="CASPER-3 — {agentStatuses.casper}"
  ></button>

  <button
    class="blade blade-balthasar"
    class:pulsing={running}
    style="--delay:{agentDelays.balthasar};"
    on:click={() => onAgentClick('balthasar')}
    aria-label="BALTHASAR-2 — {agentStatuses.balthasar}"
  ></button>

  <!--
    Containment ring — sits ABOVE blades (z-index 5) so it visually
    "cuts through" the blades at the perimeter, matching the reference.
  -->
  <div class="ring" aria-hidden="true"></div>

  <!--
    Agent labels — separate from blade elements so clip-path cannot clip them.
    Positioned at the center of each blade's text zone (midpoint between ring and hub).

    Text-zone midpoint = 26.5% from arena center in each blade direction.
    (ring radius 36% + hub radius 17%) / 2 = 26.5%

    Melchior  (0°):   top = 50% − 26.5% = 23.5%,  left = 50%
    Casper   (120°):  top = 50% + 13.25% = 63.25%, left = 50% + 22.95% = 72.95%
    Balthasar(240°):  top = 50% + 13.25% = 63.25%, left = 50% − 22.95% = 27.05%
  -->
  <div
    class="blade-label label-melchior"
    style="--lc:{mc};"
    aria-hidden="true"
    role="button"
    tabindex="-1"
    on:click={() => onAgentClick('melchior')}
    on:keydown={(e) => e.key === 'Enter' && onAgentClick('melchior')}
  >
    <span class="lbl-kanji">{statusKanji[agentStatuses.melchior]}</span>
    <span class="lbl-num">1</span>
    <span class="lbl-name">MELCHIOR</span>
  </div>

  <div
    class="blade-label label-casper"
    style="--lc:{cc};"
    aria-hidden="true"
    role="button"
    tabindex="-1"
    on:click={() => onAgentClick('casper')}
    on:keydown={(e) => e.key === 'Enter' && onAgentClick('casper')}
  >
    <span class="lbl-kanji">{statusKanji[agentStatuses.casper]}</span>
    <span class="lbl-num">3</span>
    <span class="lbl-name">CASPER</span>
  </div>

  <div
    class="blade-label label-balthasar"
    style="--lc:{bc};"
    aria-hidden="true"
    role="button"
    tabindex="-1"
    on:click={() => onAgentClick('balthasar')}
    on:keydown={(e) => e.key === 'Enter' && onAgentClick('balthasar')}
  >
    <span class="lbl-kanji">{statusKanji[agentStatuses.balthasar]}</span>
    <span class="lbl-num">2</span>
    <span class="lbl-name">BALTHASAR</span>
  </div>

  <!-- Central hub -->
  <div class="hub" style="--hc:{hc};" aria-live="polite">
    <span class="hub-kanji" style="color:{hc}; border-color:{hc};">
      {consensusKanji[consensus.status]}
    </span>
    <span class="hub-label">MAGI</span>
  </div>

</div>

<style>
  /* ─── Arena ─── */
  .arena {
    position: relative;
    /*
     * Fill the wrapper (a size container) as a square.
     * min(100cqw, 100cqh) = side length that fits in both dimensions.
     * Falls back to min(92vw, 88vh) when container queries are unsupported.
     */
    width: min(92vw, 88vh); /* fallback: browsers without container-query support */
    width: min(100cqw, 100cqh); /* overrides on modern browsers with size container */
    aspect-ratio: 1 / 1;
    background: #ffd600;
  }

  /* ─── Blades ─── */
  .blade {
    position: absolute;
    width: 44%;
    height: 44%;
    left: 28%;
    top: 6%;
    background: #0a0a00;
    border: none;
    clip-path: polygon(8% 0%, 92% 0%, 76% 100%, 24% 100%);
    -webkit-clip-path: polygon(8% 0%, 92% 0%, 76% 100%, 24% 100%);
    transform-origin: center bottom;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.18s;
  }

  .blade:hover { opacity: 0.78; }

  .blade-melchior  { transform: rotate(0deg);   z-index: 4; }
  .blade-casper    { transform: rotate(120deg);  z-index: 3; }
  .blade-balthasar { transform: rotate(240deg);  z-index: 2; }

  .blade.pulsing {
    animation: blade-pulse 1.1s ease-in-out infinite;
    animation-delay: var(--delay, 0s);
  }

  @keyframes blade-pulse {
    0%, 100% { opacity: 1;    }
    50%       { opacity: 0.38; }
  }

  /* ─── Containment ring ─── */
  .ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 72%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background: transparent;
    border: 5px solid #0a0a00;
    z-index: 5;
    pointer-events: none;
  }

  /* ─── Blade labels ─── */
  /*
   * Positioned outside blade elements so clip-path cannot affect them.
   * Centered on each blade's text zone via translate(-50%, -50%).
   * z-index 6 puts them above the ring border.
   */
  .blade-label {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15em;
    z-index: 6;
    cursor: pointer;
  }

  .label-melchior  { top: 23.5%; left: 50%;     }
  .label-casper    { top: 63%;   left: 73%;      }
  .label-balthasar { top: 63%;   left: 27%;      }

  .lbl-kanji {
    border: 2px solid var(--lc, #ffd600);
    color: var(--lc, #ffd600);
    padding: 0.1em 0.45em;
    font-family: var(--font-display);
    font-size: clamp(0.6rem, 3.5cqw, 1.5rem);
    letter-spacing: 0.1em;
    line-height: 1.3;
    white-space: nowrap;
    background: transparent;
  }

  .lbl-num {
    color: var(--lc, #ffd600);
    font-family: var(--font-display);
    font-size: clamp(0.9rem, 5cqw, 2.2rem);
    font-weight: 900;
    line-height: 1;
  }

  .lbl-name {
    color: var(--lc, #ffd600);
    font-family: var(--font-display);
    font-size: clamp(0.4rem, 2.2cqw, 0.9rem);
    letter-spacing: 0.12em;
    white-space: nowrap;
    opacity: 0.85;
  }

  /* ─── Hub ─── */
  .hub {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 34%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background: #0a0a00;
    border: 4px solid var(--hc, #ffd600);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2em;
    z-index: 10;
    pointer-events: none;
  }

  .hub-kanji {
    border: 2px solid;
    padding: 0.1em 0.4em;
    font-family: var(--font-display);
    font-size: clamp(0.55rem, 3.5cqw, 1.5rem);
    letter-spacing: 0.06em;
    text-align: center;
    line-height: 1.3;
    white-space: nowrap;
  }

  .hub-label {
    color: rgba(255, 214, 0, 0.4);
    font-family: var(--font-display);
    font-size: clamp(0.3rem, 1.8cqw, 0.72rem);
    letter-spacing: 0.35em;
  }
</style>
