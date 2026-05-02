<script lang="ts">
  import type { AgentName, AnswerStatus } from '$lib/types';

  export let agent: AgentName;
  export let title = '';
  export let role = '';
  export let status: AnswerStatus = 'pending';
  export let flashing = false;
  export let showStatus = true;

  const clips: Record<AgentName, string> = {
    melchior: 'polygon(35% 0, 100% 0, 100% 100%, 0 100%, 0 44%)',
    balthasar: 'polygon(0 0, 100% 0, 100% 80%, 75% 100%, 25% 100%, 0 80%)',
    casper: 'polygon(0 0, 65% 0, 100% 44%, 100% 100%, 0 100%)'
  };

  const statusColors: Record<AnswerStatus, string> = {
    pending: '#3caee0',
    yes: '#52e691',
    no: '#a41413',
    conditional: '#ff8d00',
    info: '#3caee0',
    error: '#9a9a9a'
  };

  const statusText: Record<AnswerStatus, string> = {
    pending: '#000000',
    yes: '#052216',
    no: '#f5e9e9',
    conditional: '#251500',
    info: '#ff8d00',
    error: '#ff8d00'
  };

  const outcomeStatuses = new Set<AnswerStatus>(['yes', 'no', 'conditional']);
  const agentDelay: Record<AgentName, string> = {
    melchior: '-0.11s',
    balthasar: '-0.23s',
    casper: '-0.37s'
  };
  const agentDrift: Record<AgentName, string> = {
    melchior: '1.03',
    balthasar: '0.91',
    casper: '1.12'
  };

  $: accent = statusColors[status] ?? statusColors.pending;
  $: ink = statusText[status] ?? '#001520';
  $: panelBg = status === 'pending' ? '#8dd9ff' : outcomeStatuses.has(status) ? accent : 'rgba(12, 6, 1, 0.82)';
  $: isLoadingState = flashing && (status === 'pending' || status === 'info' || status === 'conditional');
  $: flickerDelay = agentDelay[agent] ?? '0s';
  $: flickerDrift = agentDrift[agent] ?? '1';
</script>

<article
  class={`wise terminal-box ${isLoadingState ? 'flicker-card' : ''} ${status === 'conditional' ? 'is-conditional' : ''} state-${status} agent-${agent}`}
  style={`--accent:${accent}; --ink:${ink}; --panel-bg:${panelBg}; --clip:${clips[agent]}; --flicker-delay:${flickerDelay}; --flicker-drift:${flickerDrift};`}
>
  <header>
    <h3>{title}</h3>
    <small>{role}</small>
  </header>
  <footer>{showStatus ? status.toUpperCase() : ''}</footer>
</article>

<style>
  @keyframes card-flicker {
    0%,
    100% {
      filter: brightness(1);
      background: var(--panel-bg);
    }
    50% {
      filter: brightness(0.6);
      background: color-mix(in srgb, var(--panel-bg) 35%, #000 65%);
    }
  }

  @keyframes card-jitter {
    0%,
    100% {
      opacity: 1;
      transform: translateZ(0) scale(1);
    }
    17% {
      opacity: 0.95;
      transform: translateZ(0) scale(0.998);
    }
    33% {
      opacity: 0.86;
      transform: translateZ(0) scale(1.001);
    }
    51% {
      opacity: 0.98;
      transform: translateZ(0) scale(0.999);
    }
    68% {
      opacity: 0.9;
      transform: translateZ(0) scale(1.0015);
    }
    84% {
      opacity: 0.97;
      transform: translateZ(0) scale(0.9992);
    }
  }

  @keyframes card-flicker-urgent {
    0%,
    100% {
      filter: brightness(1);
      background: var(--panel-bg);
    }
    25% {
      filter: brightness(0.7);
      background: color-mix(in srgb, var(--panel-bg) 45%, #000 55%);
    }
    50% {
      filter: brightness(0.45);
      background: color-mix(in srgb, var(--panel-bg) 25%, #000 75%);
    }
    75% {
      filter: brightness(0.75);
      background: color-mix(in srgb, var(--panel-bg) 48%, #000 52%);
    }
  }

  @keyframes status-pulse {
    0%,
    100% {
      opacity: 0.65;
      text-shadow: none;
    }
    50% {
      opacity: 1;
      text-shadow: 0 0 8px color-mix(in srgb, var(--accent) 70%, #ffffff 30%);
    }
  }

  .wise {
    position: relative;
    isolation: isolate;
    border: 2px solid color-mix(in srgb, var(--accent) 65%, #000 35%);
    background: var(--panel-bg);
    color: var(--ink);
    padding: 2rem 1rem;
    min-height: 180px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 0.5rem;
    justify-items: center;
    align-items: center;
    text-align: center;
    cursor: pointer;
    transition: transform 0.18s ease;
    clip-path: var(--clip);
    -webkit-clip-path: var(--clip);
    overflow: hidden;
  }

  .wise.state-yes,
  .wise.state-no,
  .wise.state-conditional {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent 70%);
  }

  .wise::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 2px solid color-mix(in srgb, var(--accent) 40%, #000 60%);
    opacity: 0.9;
    pointer-events: none;
    clip-path: var(--clip);
    -webkit-clip-path: var(--clip);
    z-index: 2;
  }

  .wise.flicker-card {
    animation:
      card-flicker calc(0.28s * var(--flicker-drift)) steps(2, end) infinite,
      card-jitter calc(0.93s * var(--flicker-drift)) linear infinite;
    animation-delay: var(--flicker-delay), calc(var(--flicker-delay) * 1.7);
  }

  .wise.flicker-card.is-conditional {
    animation:
      card-flicker-urgent calc(0.2s * var(--flicker-drift)) steps(2, end) infinite,
      card-jitter calc(0.74s * var(--flicker-drift)) linear infinite;
    animation-delay: var(--flicker-delay), calc(var(--flicker-delay) * 1.4);
  }

  .wise.flicker-card footer {
    animation: status-pulse calc(0.65s * var(--flicker-drift)) ease-in-out infinite;
    animation-delay: calc(var(--flicker-delay) * -1);
  }

  .wise:hover {
    transform: translateY(-2px);
  }

  header {
    display: grid;
    gap: 0.35rem;
    justify-items: center;
  }

  h3 {
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: 0.12em;
    font-size: clamp(1.05rem, 2.3vw, 1.65rem);
    font-weight: 900;
  }

  small {
    font-size: 0.82rem;
    letter-spacing: 0.09em;
    font-weight: 700;
  }

  footer {
    color: var(--ink);
    font-weight: 700;
    letter-spacing: 0.11em;
    text-align: center;
  }
</style>
