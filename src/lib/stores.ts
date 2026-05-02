import { get, writable } from 'svelte/store';
import type { AgentName, ArtabanState, ArtabanVerdict, AnswerStatus, MagiState } from '$lib/types';

const baseAgent = () => ({
  response: '',
  challenge: '',
  status: 'pending' as AnswerStatus,
  finalStatus: 'pending' as AnswerStatus,
  answerId: 0
});

const baseArtaban = (): ArtabanState => ({
  active: false,
  verdict: null,
  concern: '',
  reasoning: '',
  streaming: false
});

const initialState: MagiState = {
  phase: 0,
  question: '',
  isYesNo: null,
  agents: {
    melchior: baseAgent(),
    balthasar: baseAgent(),
    casper: baseAgent()
  },
  consensus: {
    status: 'pending',
    canExecute: false
  },
  artaban: baseArtaban(),
  questionId: 0
};

export const magiStore = writable<MagiState>(initialState);

export function beginQuestion(question: string): number {
  let nextId = 0;
  magiStore.update((state) => {
    nextId = state.questionId + 1;
    return {
      ...initialState,
      question,
      questionId: nextId,
      phase: 1
    };
  });
  return nextId;
}

export function setPhase(phase: number): void {
  magiStore.update((s) => ({ ...s, phase }));
}

export function setYesNo(isYesNo: boolean): void {
  magiStore.update((s) => ({ ...s, isYesNo }));
}

export function appendAgentText(agent: AgentName, field: 'response' | 'challenge', text: string): void {
  magiStore.update((s) => ({
    ...s,
    agents: {
      ...s.agents,
      [agent]: {
        ...s.agents[agent],
        [field]: `${s.agents[agent][field]}${text}`,
        answerId: s.agents[agent].answerId + 1
      }
    }
  }));
}

export function setAgentStatus(agent: AgentName, status: AnswerStatus): void {
  magiStore.update((s) => ({
    ...s,
    agents: {
      ...s.agents,
      [agent]: {
        ...s.agents[agent],
        status,
        finalStatus: status
      }
    }
  }));
}

export function setConsensus(status: MagiState['consensus']['status'], canExecute: boolean): void {
  magiStore.update((s) => ({ ...s, consensus: { status, canExecute } }));
}

/** Called when Artaban's verdict and concern arrive (before reasoning streams in). */
export function setArtabanVerdict(verdict: ArtabanVerdict, concern: string): void {
  magiStore.update((s) => ({
    ...s,
    artaban: {
      ...s.artaban,
      active: true,
      verdict,
      concern,
      streaming: verdict !== 'approved' // only stream reasoning for non-approved
    }
  }));
}

/** Append a chunk of Artaban's streamed reasoning. */
export function appendArtabanReasoning(chunk: string): void {
  magiStore.update((s) => ({
    ...s,
    artaban: {
      ...s.artaban,
      reasoning: `${s.artaban.reasoning}${chunk}`
    }
  }));
}

/** Called when Artaban's reasoning stream is complete. */
export function finalizeArtaban(): void {
  magiStore.update((s) => ({
    ...s,
    artaban: { ...s.artaban, streaming: false }
  }));
}

export function currentState(): MagiState {
  return get(magiStore);
}
