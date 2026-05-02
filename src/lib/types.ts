export type AgentName = 'melchior' | 'balthasar' | 'casper';

export type AnswerStatus = 'yes' | 'no' | 'conditional' | 'info' | 'error' | 'pending';

export type ConsensusStatus = 'pending' | 'yes' | 'no' | 'conditional' | 'info' | 'error';

/**
 * Artaban's verdict.
 * - approved / pause / escalate: review mode (Magi reached YES consensus)
 * - yes / no: deciding mode (Magi all returned CONDITIONAL — Artaban casts the tie-breaking vote)
 */
export type ArtabanVerdict = 'approved' | 'pause' | 'escalate' | 'yes' | 'no';

export interface ArtabanState {
  /** true once Artaban has completed his review */
  active: boolean;
  verdict: ArtabanVerdict | null;
  /** one-sentence summary of the ethical concern (empty if approved) */
  concern: string;
  /** full reasoning text, streamed in progressively */
  reasoning: string;
  /** true while streaming */
  streaming: boolean;
}

export interface AgentState {
  response: string;
  challenge: string;
  status: AnswerStatus;
  finalStatus: AnswerStatus;
  answerId: number;
}

export interface MagiState {
  phase: number;
  question: string;
  isYesNo: boolean | null;
  agents: Record<AgentName, AgentState>;
  consensus: {
    status: ConsensusStatus;
    canExecute: boolean;
  };
  artaban: ArtabanState;
  questionId: number;
}

export interface AgentAnswer {
  agent: AgentName;
  reasoning: string;
  status: AnswerStatus;
  finalStatus: AnswerStatus;
}

export interface PipelineResult {
  isYesNo: boolean;
  answers: AgentAnswer[];
  consensus: {
    status: ConsensusStatus;
    canExecute: boolean;
  };
}

// ────────────────────────────────────────────────────────────
// magi-sent domain types
// Sentiment + trend engine. See PLAN.md.
// ────────────────────────────────────────────────────────────

export type SourceKind =
  | 'rss'
  | 'gdelt'
  | 'newsapi'
  | 'bluesky'
  | 'mastodon'
  | 'reddit';

export type IsoLang = string; // ISO 639-1, e.g. 'en', 'ar', 'fa'

/** A connected feed we ingest from. */
export interface Source {
  id: string;
  kind: SourceKind;
  /** human-readable label, e.g. "Al Jazeera English RSS" */
  label: string;
  /** feed URL or query identifier */
  endpoint: string;
  /** ISO 639-1 if known; null when mixed/multilingual */
  lang: IsoLang | null;
  /** topic tags this source typically covers */
  topics: string[];
  /** ingest cadence override in seconds, null = use default for kind */
  pollSeconds: number | null;
  active: boolean;
  createdAt: string;
}

/** Normalised content unit. Every connector emits this shape. */
export interface Document {
  id: string;
  sourceId: string;
  /** stable cross-source key (URL hash or platform id) for dedup */
  externalId: string;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  title: string | null;
  text: string;
  lang: IsoLang;
  /** original platform payload, kept for reprocessing */
  rawPayload: Record<string, unknown> | null;
}

export type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'mixed';
export type Stance = 'pro' | 'against' | 'neutral' | 'unclear';

export interface Entity {
  text: string;
  type: 'PERSON' | 'ORG' | 'PLACE' | 'CAUSE' | 'EVENT' | 'OTHER';
  /** linked id when available (Wikidata, custom registry) */
  refId?: string;
}

export interface EnrichmentResult {
  documentId: string;
  /** detected language; may differ from Document.lang if connector got it wrong */
  lang: IsoLang;
  /** translated text when lang !== 'en' */
  textEn: string | null;
  entities: Entity[];
  topics: string[];
  sentiment: {
    label: SentimentLabel;
    score: number; // -1..1
    confidence: number; // 0..1
  };
  emotion?: Record<string, number>;
  stance?: { cause: string; value: Stance; confidence: number }[];
  /** vector goes to pgvector column, not serialised here */
  embeddingDim: number;
  enrichedAt: string;
}

/** What each lens emits during a briefing run. */
export type LensName = 'signals' | 'voices' | 'strategy';

export interface AgentLensFinding {
  lens: LensName;
  agent: AgentName;
  /** structured claims with evidence */
  findings: Array<{
    statement: string;
    confidence: number; // 0..1
    citations: string[]; // Document ids
  }>;
  /** narrative summary the lens contributes to the synthesiser */
  narrative: string;
  /** anything the lens flags for human attention */
  watchItems?: string[];
}

export type TrendKind = 'volume_spike' | 'sentiment_shift' | 'narrative_emergence' | 'entity_cooccurrence';

export interface Trend {
  id: string;
  kind: TrendKind;
  /** scope: which topic / entity / cluster the trend is about */
  scope: { topic?: string; entity?: string; clusterId?: string };
  windowStart: string;
  windowEnd: string;
  /** z-score or other anomaly magnitude */
  magnitude: number;
  /** representative documents */
  documentIds: string[];
  /** human-readable headline (auto-generated, may be revised by synthesiser) */
  summary: string;
  detectedAt: string;
}

export type BriefingAudience = 'campaigner' | 'leadership';
export type BriefingCadence = 'daily' | 'weekly' | 'ad_hoc';

export interface BriefingSection {
  heading: string;
  body: string;
  citations: string[]; // Document ids
}

export interface Briefing {
  id: string;
  audience: BriefingAudience;
  cadence: BriefingCadence;
  topic: string | null;
  windowStart: string;
  windowEnd: string;
  headline: string;
  summary: string;
  sections: BriefingSection[];
  trendIds: string[];
  /** lens findings this briefing was synthesised from */
  lensFindings: AgentLensFinding[];
  /** Artaban's pre-publication review */
  conscienceReview: {
    verdict: 'approved' | 'revise' | 'block';
    concerns: string[];
    notes: string;
  };
  publishedAt: string | null;
  createdAt: string;
  version: number;
}
