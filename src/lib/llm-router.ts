// Model-tier routing. All callsites use pickModel() — no hardcoded model strings.
// Lint rule (caleb-os/no-hardcoded-model-id) enforces this at build time (Phase 2).

export type TaskCategory =
  | 'classify'        // fast classification, routing, entity resolution, reranking
  | 'extract'         // structured extraction from documents or messages
  | 'rerank'          // top-K relevance ranking
  | 'agent-decision'  // loop decision-makers, opportunity scoring, proactive insights
  | 'draft'           // answer synthesis, content generation, briefs, replies
  | 'reasoning'       // deep multi-step analysis, GraphRAG, complex recommendations

const MODEL_MAP: Record<TaskCategory, string> = {
  classify:        'claude-haiku-4-5-20251001',
  extract:         'claude-haiku-4-5-20251001',
  rerank:          'claude-haiku-4-5-20251001',
  'agent-decision':'claude-fable-5',
  draft:           'claude-sonnet-4-6',
  reasoning:       'claude-opus-4-8',
}

export function pickModel(task: TaskCategory): string {
  return MODEL_MAP[task]
}
