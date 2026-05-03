import { parseClassification } from './src/lib/enrich/sentiment-parser.ts';

const taxonomy = [
  { slug: 'sudan', label: 'Sudan', description: null },
  { slug: 'iran', label: 'Iran', description: null },
  { slug: 'us_politics', label: 'US politics', description: null }
];

const cases = [
  { name: 'happy path', raw: JSON.stringify({ sentiment_label: 'negative', sentiment_score: -0.7, sentiment_confidence: 0.85, emotion: { anger: 0.6, fear: 0.4, joy: 0, sadness: 0.5 }, detected_lang: 'en', topics: ['iran', 'us_politics'] }), expect: { label: 'negative', score: -0.7, topicsLen: 2 } },
  { name: 'fenced JSON', raw: '```json\n{"sentiment_label":"positive","sentiment_score":0.5,"sentiment_confidence":0.7,"detected_lang":"ar","topics":["sudan"]}\n```', expect: { label: 'positive', score: 0.5, topicsLen: 1 } },
  { name: 'invalid topic filtered', raw: '{"sentiment_label":"neutral","sentiment_score":0,"sentiment_confidence":0.5,"topics":["iran","made_up_topic"]}', expect: { label: 'neutral', score: 0, topicsLen: 1 } },
  { name: 'garbage falls back', raw: 'I am not JSON at all', expect: { label: 'neutral', score: 0, topicsLen: 0 } },
  { name: 'out-of-range clamps', raw: '{"sentiment_label":"positive","sentiment_score":2.5,"sentiment_confidence":1.5}', expect: { label: 'positive', score: 1, topicsLen: 0 } },
  { name: 'arabic detected_lang', raw: '{"sentiment_label":"negative","sentiment_score":-0.5,"sentiment_confidence":0.8,"detected_lang":"ar","topics":["sudan"]}', expect: { label: 'negative', score: -0.5, topicsLen: 1 } }
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = parseClassification(c.raw, taxonomy);
  const ok = r.sentiment.label === c.expect.label && Math.abs(r.sentiment.score - c.expect.score) < 1e-9 && r.topics.length === c.expect.topicsLen;
  if (ok) { console.log(`  PASS  ${c.name}`); pass++; }
  else { console.log(`  FAIL  ${c.name}`); console.log(`        got: ${JSON.stringify(r)}`); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
