<script lang="ts">
  export let challengeActive = false;
</script>

<section class="magi-grid" style={`--pulse:${challengeActive ? 'pulse-link 0.8s infinite' : 'none'};`}>

  <div class="line line-a" aria-hidden="true"></div>
  <div class="line line-b" aria-hidden="true"></div>
  <div class="line line-c" aria-hidden="true"></div>
  <div class="title" aria-hidden="true">MAGI</div>

  <div class="balthasar"><slot name="balthasar" /></div>
  <div class="casper"><slot name="casper" /></div>
  <div class="melchior"><slot name="melchior" /></div>
  <div class="response"><slot name="response" /></div>
</section>

<style>
  .magi-grid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 0.8rem;
    aspect-ratio: 2 / 1;
    container-type: inline-size;
    isolation: isolate;
    overflow: hidden;
  }

  .title {
    position: absolute;
    inset: auto 0 50% 0;
    text-align: center;
    transform: translateY(50%);
    font-family: var(--font-display);
    letter-spacing: 0.4em;
    color: rgba(255, 141, 0, 0.5);
    font-size: clamp(1rem, 4cqw, 2rem);
    pointer-events: none;
    z-index: 0;
  }

  .line {
    position: absolute;
    inset: 50% auto auto 50%;
    width: 52%;
    height: 5px;
    background: var(--nerv-orange);
    transform-origin: left center;
    opacity: 0.45;
    animation: var(--pulse);
    z-index: 0;
  }

  /* line-a: straight up toward BALTHASAR (top-center) */
  .line-a {
    transform: rotate(-90deg);
  }

  /* line-b: down-left toward CASPER (bottom-left) — atan2(100,-200) ≈ 153° */
  .line-b {
    transform: rotate(153deg);
  }

  /* line-c: down-right toward MELCHIOR (bottom-right) — atan2(100,200) ≈ 27° */
  .line-c {
    transform: rotate(27deg);
  }

  .balthasar {
    grid-column: 1 / 3;
    width: 52%;
    justify-self: center;
    z-index: 1;
  }

  .casper {
    grid-row: 2;
    grid-column: 1;
    z-index: 1;
  }

  .melchior {
    grid-row: 2;
    grid-column: 2;
    z-index: 1;
  }

  .response {
    position: absolute;
    right: 0.35rem;
    top: 0.4rem;
    width: min(30%, 260px);
    z-index: 2;
  }

  /*
   * Media query (not @container) because .magi-grid is its own container —
   * an element cannot respond to its own container query, only its descendants
   * can. grid-row: auto clears the explicit row-2 placement on casper/melchior
   * so they stack sequentially instead of overlapping in a single column.
   */
  @media (max-width: 760px) {
    .magi-grid {
      aspect-ratio: auto;
      grid-template-columns: 1fr;
      grid-template-rows: auto;
    }

    .balthasar,
    .casper,
    .melchior {
      grid-column: 1;
      grid-row: auto;
      width: 100%;
    }

    .balthasar {
      justify-self: stretch;
    }

    .response {
      position: static;
      width: 100%;
    }

    .line {
      display: none;
    }
  }
</style>
