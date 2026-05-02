// Embedding client. text-embedding-3-small (1536 dims) by default.
// See PLAN.md §3.4.

export interface EmbedClient {
  /** Returns the embedding vector. Caller writes to documents.embedding. */
  embed(text: string): Promise<number[]>;
  dim: number;
}

export const embedClient: EmbedClient = {
  dim: 1536,
  async embed() {
    // TODO(phase-1): OpenAI client call. Stub returns zero vector so types
    // line up during foundation work.
    return new Array(1536).fill(0);
  }
};
