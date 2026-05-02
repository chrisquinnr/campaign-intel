<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { source } from 'sveltekit-sse';
  import ArtabanAlert from '$lib/components/ArtabanAlert.svelte';
  import Header from '$lib/components/Header.svelte';
  import InputArea from '$lib/components/InputArea.svelte';
  import Magi from '$lib/components/Magi.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Response from '$lib/components/Response.svelte';
  import Status from '$lib/components/Status.svelte';
  import WiseMan from '$lib/components/WiseMan.svelte';
  import YellowMagi from '$lib/components/YellowMagi.svelte';
  import {
    appendAgentText,
    appendArtabanReasoning,
    beginQuestion,
    currentState,
    finalizeArtaban,
    magiStore,
    setAgentStatus,
    setArtabanVerdict,
    setConsensus,
    setPhase,
    setYesNo
  } from '$lib/stores';
  import type { AgentName } from '$lib/types';

  let question = '';
  let running = false;
  let modalOpen = false;
  let modalTitle = '';
  let modalContent = '';
  let queryError: string | null = null;
  let streamRef: ReturnType<typeof source> | null = null;
  let channelUnsubs: Array<() => void> = [];
  let watchdogRef: ReturnType<typeof setInterval> | null = null;
  let lastEventAt = 0;

  type Theme = 'nerv' | 'magi2';
  let theme: Theme = 'nerv';

  onMount(() => {
    const saved = localStorage.getItem('magi-theme') as Theme | null;
    if (saved === 'nerv' || saved === 'magi2') theme = saved;

    // Allow external sources to pipe a question in via ?question= URL parameter.
    // The param is cleared immediately so a page refresh doesn't re-trigger.
    const urlQ = new URL(location.href).searchParams.get('question')?.trim();
    if (urlQ) {
      question = urlQ;
      history.replaceState({}, '', location.pathname);
      setTimeout(() => startQuery(urlQ), 0);
    }

    // Subscribe to questions pushed from external sources (MCP tool, CLI, etc.)
    // via the /api/live SSE channel. Ignored while a deliberation is in progress.
    const events = new EventSource('/api/live');
    events.addEventListener('message', (e) => {
      try {
        const { question: q } = JSON.parse(e.data) as { question: string };
        if (q?.trim() && !running) {
          question = q.trim();
          startQuery(q.trim());
        }
      } catch { /* ignore malformed push events */ }
    });
    return () => events.close();
  });

  function switchTheme(next: Theme): void {
    theme = next;
    localStorage.setItem('magi-theme', next);
  }

  const QUERY_TIMEOUT_MS = 60000;

  function stopWatchdog(): void {
    if (watchdogRef) {
      clearInterval(watchdogRef);
      watchdogRef = null;
    }
  }

  function failQuery(message: string): void {
    queryError = message;
    setConsensus('error', false);
    running = false;
    stopWatchdog();
    clearStreamBindings();
    streamRef?.close();
    streamRef = null;
  }

  function startWatchdog(): void {
    stopWatchdog();
    lastEventAt = Date.now();
    watchdogRef = setInterval(() => {
      if (!running) return;
      if (Date.now() - lastEventAt > QUERY_TIMEOUT_MS) {
        failQuery('Query timed out while waiting for MAGI response.');
      }
    }, 2000);
  }

  const parseJson = (raw: string): Record<string, any> | null => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  function clearStreamBindings(): void {
    for (const unsub of channelUnsubs) {
      unsub();
    }
    channelUnsubs = [];
  }

  function bindChannel(channelName: string, onData: (payload: Record<string, any>) => void): void {
    if (!streamRef) return;
    const transformed = streamRef.select(channelName).transform((raw) => {
      if (!raw) return raw;
      lastEventAt = Date.now();
      const payload = parseJson(raw);
      if (payload) onData(payload);
      return raw;
    });

    // sveltekit-sse stores are lazy; subscribing activates the channel stream.
    const unsub = transformed.subscribe(() => {});
    channelUnsubs.push(unsub);
  }

  function bindAgentChannel(prefix: 'agent' | 'challenge', agent: AgentName): void {
    bindChannel(`${prefix}:${agent}`, (payload) => {
      if (payload.delta) {
        appendAgentText(agent, prefix === 'agent' ? 'response' : 'challenge', String(payload.delta));
      }
      if (payload.status) {
        setAgentStatus(agent, payload.status);
      }
    });
  }

  async function startQuery(inputQuestion: string): Promise<void> {
    queryError = null;
    running = true;
    const qid = beginQuestion(inputQuestion);
    startWatchdog();

    clearStreamBindings();
    streamRef?.close();
    streamRef = source(`/api/query?question=${encodeURIComponent(inputQuestion)}`, {
      close() {
        clearStreamBindings();
        stopWatchdog();
        if (running && currentState().consensus.status === 'pending') {
          failQuery('Connection closed before consensus was received.');
          return;
        }
        running = false;
      }
    });

    bindChannel('phase', (payload) => {
      setPhase(Number(payload.phase ?? 0));
    });

    bindChannel('classify', (payload) => {
      setYesNo(Boolean(payload.isYesNo));
    });

    bindAgentChannel('agent', 'melchior');
    bindAgentChannel('agent', 'balthasar');
    bindAgentChannel('agent', 'casper');

    bindAgentChannel('challenge', 'melchior');
    bindAgentChannel('challenge', 'balthasar');
    bindAgentChannel('challenge', 'casper');

    bindChannel('consensus', (payload) => {
      setConsensus(payload.status, Boolean(payload.canExecute));
      // Don't close stream yet — Artaban may follow if canExecute is true.
      // Defer cleanup so Svelte can flush the store update to the DOM first.
      if (!payload.canExecute) {
        running = false;
        stopWatchdog();
        setTimeout(() => {
          clearStreamBindings();
          streamRef?.close();
          streamRef = null;
        }, 0);
      }
    });

    // Artaban verdict arrives as a single event (verdict + concern)
    bindChannel('artaban:verdict', (payload) => {
      const v = payload.verdict as import('$lib/types').ArtabanVerdict;
      setArtabanVerdict(v, String(payload.concern ?? ''));
      // In deciding mode, Artaban's yes/no becomes the final consensus
      if (v === 'yes' || v === 'no') {
        setConsensus(v, v === 'yes');
      }
    });

    // Artaban reasoning streams in progressively
    bindChannel('artaban:reasoning', (payload) => {
      if (payload.delta) {
        appendArtabanReasoning(String(payload.delta));
      }
      if (payload.done) {
        finalizeArtaban();
        running = false;
        stopWatchdog();
        // Defer cleanup so Svelte can flush finalizeArtaban() to the DOM first.
        setTimeout(() => {
          clearStreamBindings();
          streamRef?.close();
          streamRef = null;
        }, 0);
      }
    });

    bindChannel('error', (payload) => {
      failQuery(`Query error: ${payload.message ?? 'Unknown error'}`);
    });

    // Protect against stale streams by checking the latest question id.
    if (currentState().questionId !== qid) {
      clearStreamBindings();
      streamRef.close();
    }
  }

  onDestroy(() => {
    stopWatchdog();
    clearStreamBindings();
    streamRef?.close();
  });

  function openAgent(agent: AgentName): void {
    const snapshot = currentState();
    const a = snapshot.agents[agent];
    modalTitle = `${agent.toUpperCase()} :: STATUS ${agentStatuses[agent].toUpperCase()}`;
    modalContent = `RESPONSE:\n${a.response || '(none)'}\n\nCHALLENGE:\n${a.challenge || '(none)'}`;
    modalOpen = true;
  }

  // Inline store access so Svelte 5 tracks the dependency explicitly.
  $: agentStatuses = {
    melchior: $magiStore.agents.melchior.finalStatus,
    balthasar: $magiStore.agents.balthasar.finalStatus,
    casper: $magiStore.agents.casper.finalStatus
  };

  $: artaban = $magiStore.artaban;
  $: artabanVisible = artaban.active && artaban.verdict !== 'approved';

  function handleM2Submit(): void {
    if (question.trim() && !running) startQuery(question.trim());
  }

  function handleM2Keydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleM2Submit();
    }
  }
</script>

<svelte:head>
  <title>MAGI Decision System</title>
</svelte:head>

<!-- ─── NERV Theme ─── -->
{#if theme === 'nerv'}
  <main class="app-shell">
    <div class="nerv-top-bar">
      <Header title="質問" subtitle="MULTI-AGENT DECISION SUPPORT" />
      <button class="theme-toggle" on:click={() => switchTheme('magi2')} title="Switch to MAGI-2 theme">
        MAGI-2
      </button>
    </div>

    <InputArea bind:question={question} {running} onAsk={startQuery} />
    {#if queryError}
      <p class="query-error">{queryError}</p>
    {/if}

    <div style="height:0.8rem"></div>
    <Header title="解決" subtitle="MELCHIOR / BALTHASAR / CASPER" />
    <Status phase={$magiStore.phase} exMode={$magiStore.consensus.canExecute} />

    <div style="height:0.8rem"></div>
    <Magi challengeActive={$magiStore.phase === 3}>
      <svelte:fragment slot="balthasar">
        <div
          role="button"
          tabindex="0"
          on:click={() => openAgent('balthasar')}
          on:keydown={(e) => e.key === 'Enter' && openAgent('balthasar')}
        >
          <WiseMan
            agent="balthasar"
            title="BALTHASAR-2"
            role="GUARDIAN"
            status={agentStatuses.balthasar}
            showStatus={$magiStore.phase > 0}
            flashing={running}
          />
        </div>
      </svelte:fragment>

      <svelte:fragment slot="casper">
        <div
          role="button"
          tabindex="0"
          on:click={() => openAgent('casper')}
          on:keydown={(e) => e.key === 'Enter' && openAgent('casper')}
        >
          <WiseMan
            agent="casper"
            title="CASPER-3"
            role="ARBITER"
            status={agentStatuses.casper}
            showStatus={$magiStore.phase > 0}
            flashing={running}
          />
        </div>
      </svelte:fragment>

      <svelte:fragment slot="melchior">
        <div
          role="button"
          tabindex="0"
          on:click={() => openAgent('melchior')}
          on:keydown={(e) => e.key === 'Enter' && openAgent('melchior')}
        >
          <WiseMan
            agent="melchior"
            title="MELCHIOR-1"
            role="SCIENTIST"
            status={agentStatuses.melchior}
            showStatus={$magiStore.phase > 0}
            flashing={running}
          />
        </div>
      </svelte:fragment>

      <svelte:fragment slot="response">
        <Response status={$magiStore.consensus.status} />
      </svelte:fragment>
    </Magi>

    {#if artabanVisible && artaban.verdict}
      <ArtabanAlert
        verdict={artaban.verdict}
        concern={artaban.concern}
        reasoning={artaban.reasoning}
        streaming={artaban.streaming}
      />
    {/if}
  </main>

<!-- ─── MAGI-2 Theme ─── -->
{:else}
  <div class="m2-page">

    <!-- Top bar -->
    <div class="m2-topbar">
      <span class="m2-title">
        MAGI<span class="m2-title-sub">-2</span>
        {#if $magiStore.phase > 0}
          <span class="m2-phase" class:m2-phase-artaban={$magiStore.phase === 5}>
            {$magiStore.phase === 5 ? 'ARTABAN' : `PHASE:${$magiStore.phase}`}
          </span>
        {/if}
      </span>
      <button class="theme-toggle m2-toggle" on:click={() => switchTheme('nerv')} title="Switch to NERV theme">
        NERV
      </button>
    </div>

    <!-- Arena -->
    <div class="m2-arena-wrapper">
      <YellowMagi
        {running}
        {agentStatuses}
        consensus={$magiStore.consensus}
        onAgentClick={openAgent}
      />
    </div>

    <!-- Artaban alert (appears between arena and execute strip) -->
    {#if artabanVisible && artaban.verdict}
      <div class="m2-artaban-wrap">
        <ArtabanAlert
          verdict={artaban.verdict}
          concern={artaban.concern}
          reasoning={artaban.reasoning}
          streaming={artaban.streaming}
        />
      </div>
    {/if}

    <!-- Error -->
    {#if queryError}
      <div class="m2-error">{queryError}</div>
    {/if}

    <!-- Bottom input bar -->
    <div class="m2-input-bar">
      <textarea
        class="m2-textarea"
        bind:value={question}
        rows="2"
        placeholder="Enter your question…"
        disabled={running}
        on:keydown={handleM2Keydown}
      ></textarea>
      <button
        class="m2-send"
        disabled={running || !question.trim()}
        on:click={handleM2Submit}
      >
        {running ? '解析中' : '送 信'}
      </button>
    </div>
  </div>
{/if}

<Modal open={modalOpen} title={modalTitle} content={modalContent} onClose={() => (modalOpen = false)} />

<style>
  /* ─── Shared theme toggle ─── */
  .theme-toggle {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    padding: 0.3rem 0.65rem;
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }

  .theme-toggle:hover {
    opacity: 1;
  }

  /* ─── NERV theme extras ─── */
  .nerv-top-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.6rem;
  }

  .nerv-top-bar :global(.section-title) {
    margin: 0;
  }

  .query-error {
    margin: 0.45rem 0 0;
    color: var(--nerv-red);
    letter-spacing: 0.08em;
    border: 1px solid var(--nerv-red);
    padding: 0.45rem 0.6rem;
    background: rgba(120, 10, 10, 0.2);
  }

  /* ─── MAGI-2 theme ─── */
  .m2-page {
    position: fixed;
    inset: 0;
    background: #0a0a00;
    color: #ffd600;
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 50;
    overflow: hidden;
  }

  .m2-topbar {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.55rem 1rem;
    border-bottom: 1px solid rgba(255, 214, 0, 0.2);
    flex-shrink: 0;
  }

  .m2-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    letter-spacing: 0.3em;
    color: #ffd600;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .m2-title-sub {
    font-size: 0.75em;
    opacity: 0.6;
  }

  .m2-phase {
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: rgba(255, 214, 0, 0.55);
    margin-left: 0.6rem;
  }

  /* Artaban phase: pulse amber to signal ethical review is active */
  .m2-phase-artaban {
    color: #ff8d00;
    animation: artaban-phase-pulse 0.9s ease-in-out infinite;
  }

  @keyframes artaban-phase-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }

  .m2-toggle {
    color: #ffd600;
    border-color: rgba(255, 214, 0, 0.4);
  }

  .m2-arena-wrapper {
    flex: 1;
    display: flex;
    align-items: center;       /* horizontal centering */
    justify-content: flex-start; /* push arena to top of available space */
    flex-direction: column;
    overflow: hidden;
    padding: 0.75rem 0.5rem 0.5rem;
    min-height: 0; /* allow flex shrink */
    width: 100%;
    container-type: size;
  }

  /* Artaban alert wrapper */
  .m2-artaban-wrap {
    width: 100%;
    flex-shrink: 0;
  }

  /* Error */
  .m2-error {
    width: 100%;
    padding: 0.4rem 1rem;
    background: rgba(204, 34, 17, 0.2);
    border-top: 1px solid #cc2211;
    color: #ff6655;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }

  /* Bottom input bar */
  .m2-input-bar {
    width: 100%;
    display: flex;
    align-items: stretch;
    gap: 0;
    border-top: 2px solid rgba(255, 214, 0, 0.35);
    background: #0d0d00;
    flex-shrink: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .m2-textarea {
    flex: 1;
    background: transparent;
    border: none;
    color: #ffd600;
    font-family: var(--font-body);
    font-size: 0.9rem;
    padding: 0.7rem 0.9rem;
    resize: none;
    outline: none;
    min-height: 3rem;
  }

  .m2-textarea::placeholder {
    color: rgba(255, 214, 0, 0.3);
  }

  .m2-textarea:disabled {
    opacity: 0.5;
  }

  .m2-send {
    background: transparent;
    border: none;
    border-left: 1px solid rgba(255, 214, 0, 0.35);
    color: #ffd600;
    font-family: var(--font-display);
    font-size: 0.82rem;
    letter-spacing: 0.14em;
    padding: 0 1.1rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .m2-send:hover:not(:disabled) {
    background: rgba(255, 214, 0, 0.1);
  }

  .m2-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
