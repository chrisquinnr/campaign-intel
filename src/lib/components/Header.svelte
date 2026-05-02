<script lang="ts">
  export let title = '質問';
  export let subtitle = '';
</script>

<section>
  <h2 class="section-title">{title}</h2>
  <hr class="section-rule" />
  {#if subtitle}
    <p class="subtitle">{subtitle}</p>
  {/if}
</section>

<style>
  .subtitle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--nerv-green);
    letter-spacing: 0.12em;
  }
</style>
