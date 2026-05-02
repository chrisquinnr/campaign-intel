// Named entity recognition.
// Initial implementation: Python sidecar with spaCy multilingual + custom
// gazetteer for Avaaz-tracked actors. See PLAN.md §3.4.

import type { Entity } from '$lib/types';

export interface NerClient {
  extract(text: string, lang?: string): Promise<Entity[]>;
}

export const nerClient: NerClient = {
  async extract() {
    return [];
  }
};
