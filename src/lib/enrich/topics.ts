// Topic classification against the Avaaz-managed taxonomy.
// Phase 1: simple keyword + entity rules per topic, with a Claude fallback
// for ambiguous documents. Move to a finetuned classifier if volume justifies it.
// See PLAN.md §3.4.

export interface TopicClient {
  classify(args: { text: string; lang: string; entities: string[] }): Promise<string[]>;
}

export const topicClient: TopicClient = {
  async classify() {
    return [];
  }
};
