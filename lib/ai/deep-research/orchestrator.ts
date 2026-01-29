/**
 * Deep Research Orchestrator
 * 
 * Main coordinator for the deep research workflow.
 * Implements the self-balancing research algorithm inspired by ThinkDepth.ai.
 */

import { generateText } from 'ai';
import { getResearchModel, getProviderTemperature } from '../providers';
import { executeSearches, isSearchAvailable } from './search';
import {
  RESEARCH_PLANNER_PROMPT,
  SEARCH_QUERY_GENERATOR_PROMPT,
  DRAFT_REPORT_PROMPT,
  REPORT_REFINEMENT_PROMPT,
  FINAL_REPORT_PROMPT,
} from './prompts';
import { getTemporalContextBlock } from '../datetime-context';
import type {
  DeepResearchState,
  DeepResearchConfig,
  DeepResearchEvent,
  ResearchPlan,
  ResearchFinding,
  DraftReport,
  FinalReport,
} from './types';

export type EventEmitter = (event: DeepResearchEvent) => void;

/**
 * Create initial research state
 */
export function createInitialState(userQuery: string, config: Partial<DeepResearchConfig> = {}): DeepResearchState {
  return {
    userQuery,
    findings: [],
    totalSearches: 0,
    completedSearches: 0,
    currentPhase: 'idle',
    iteration: 0,
    maxIterations: config.maxIterations ?? 3,
  };
}

/**
 * Emit a phase change event
 */
function emitPhaseChange(emit: EventEmitter, phase: DeepResearchState['currentPhase'], message: string) {
  emit({
    type: 'phase_change',
    phase,
    message,
    timestamp: new Date(),
  });
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJsonResponse<T>(text: string): T {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

/**
 * Phase 1: Create research plan
 */
async function planResearch(
  state: DeepResearchState,
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<ResearchPlan> {
  emitPhaseChange(emit, 'planning', 'Creating research plan...');

  // Include temporal context for accurate date awareness in research
  const temporalContext = getTemporalContextBlock();
  const systemPrompt = `${temporalContext}\n\n${RESEARCH_PLANNER_PROMPT}`;

  const { text } = await generateText({
    model: getResearchModel(),
    system: systemPrompt,
    prompt: `User Query: ${state.userQuery}\n\nCreate a comprehensive research plan.`,
    temperature: getProviderTemperature(0.7),
    abortSignal,
  });

  const plan = parseJsonResponse<Omit<ResearchPlan, 'originalQuery'>>(text);

  return {
    originalQuery: state.userQuery,
    ...plan,
  };
}

/**
 * Phase 2: Generate search queries from research questions
 */
async function generateSearchQueries(
  plan: ResearchPlan,
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<string[]> {
  emit({
    type: 'analysis_update',
    message: 'Generating search queries...',
    timestamp: new Date(),
  });

  // Include temporal context for date-aware query generation
  const temporalContext = getTemporalContextBlock();
  const systemPrompt = `${temporalContext}\n\n${SEARCH_QUERY_GENERATOR_PROMPT}`;

  const allQueries: string[] = [];

  for (const question of plan.researchQuestions) {
    checkAborted(abortSignal);
    const { text } = await generateText({
      model: getResearchModel(),
      system: systemPrompt,
      prompt: `Research Question: ${question}\n\nGenerate optimized search queries.`,
      temperature: getProviderTemperature(0.5),
      abortSignal,
    });

    const result = parseJsonResponse<{ queries: string[] }>(text);
    allQueries.push(...result.queries);
  }

  // Deduplicate and limit queries
  const uniqueQueries = [...new Set(allQueries)].slice(0, 15);
  return uniqueQueries;
}

/**
 * Phase 3: Execute searches
 */
async function executeResearchSearches(
  queries: string[],
  emit: EventEmitter,
  config: Partial<DeepResearchConfig>
): Promise<ResearchFinding[]> {
  emitPhaseChange(emit, 'searching', `Searching ${queries.length} queries...`);

  const findings = await executeSearches(queries, {
    maxConcurrent: config.maxConcurrentSearches ?? 3,
    maxResultsPerQuery: 5,
    abortSignal: config.abortSignal,
    onProgress: (completed, total, currentQuery) => {
      emit({
        type: 'search_progress',
        completed,
        total,
        currentQuery,
        timestamp: new Date(),
      });
    },
  });

  // Emit each finding
  for (const finding of findings) {
    emit({
      type: 'search_result',
      finding,
      timestamp: new Date(),
    });
  }

  return findings;
}

/**
 * Phase 4: Analyze findings and generate draft report
 */
async function generateDraftReport(
  plan: ResearchPlan,
  findings: ResearchFinding[],
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<DraftReport> {
  emitPhaseChange(emit, 'drafting', 'Writing draft report...');

  // Include temporal context for accurate date references in report
  const temporalContext = getTemporalContextBlock();
  const systemPrompt = `${temporalContext}\n\n${DRAFT_REPORT_PROMPT}`;

  // Compile all findings into context
  const findingsContext = findings
    .map((f) => {
      const sourcesText = f.sources
        .map((s) => `- [${s.title}](${s.url}): ${s.snippet}`)
        .join('\n');
      return `Query: ${f.query}\nSources:\n${sourcesText}`;
    })
    .join('\n\n---\n\n');

  const { text } = await generateText({
    model: getResearchModel(),
    system: systemPrompt,
    prompt: `Research Plan:
Original Query: ${plan.originalQuery}
Clarified Query: ${plan.clarifiedQuery}
Scope: ${plan.scope}
Expected Sections: ${plan.expectedSections.join(', ')}

Research Findings:
${findingsContext}

Write a comprehensive draft report based on these findings.`,
    temperature: getProviderTemperature(0.7),
    abortSignal,
  });

  return {
    content: text,
    iteration: 1,
    informationGaps: [],
    refinementSuggestions: [],
  };
}

/**
 * Phase 5: Analyze draft for gaps and refine
 */
async function refineDraft(
  draft: DraftReport,
  plan: ResearchPlan,
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<{ gaps: string[]; searches: string[] }> {
  emitPhaseChange(emit, 'refining', `Refining report (iteration ${draft.iteration})...`);

  // Include temporal context for accurate gap analysis
  const temporalContext = getTemporalContextBlock();
  const systemPrompt = `${temporalContext}\n\n${REPORT_REFINEMENT_PROMPT}`;

  const { text } = await generateText({
    model: getResearchModel(),
    system: systemPrompt,
    prompt: `Original Query: ${plan.originalQuery}
Expected Sections: ${plan.expectedSections.join(', ')}

Draft Report:
${draft.content}

Analyze this draft and identify gaps and areas for improvement.`,
    temperature: getProviderTemperature(0.5),
    abortSignal,
  });

  const analysis = parseJsonResponse<{
    informationGaps: string[];
    suggestedSearches: string[];
  }>(text);

  emit({
    type: 'refinement_update',
    iteration: draft.iteration,
    maxIterations: 3,
    gaps: analysis.informationGaps,
    timestamp: new Date(),
  });

  return {
    gaps: analysis.informationGaps,
    searches: analysis.suggestedSearches,
  };
}

/**
 * Phase 6: Generate final report
 */
async function generateFinalReport(
  draft: DraftReport,
  plan: ResearchPlan,
  findings: ResearchFinding[],
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<FinalReport> {
  emitPhaseChange(emit, 'finalizing', 'Generating final report...');

  // Include temporal context for accurate date references in final report
  const temporalContext = getTemporalContextBlock();
  const systemPrompt = `${temporalContext}\n\n${FINAL_REPORT_PROMPT}`;

  // Collect all unique sources
  const allSources = findings.flatMap((f) => f.sources);
  const uniqueSources = allSources.filter(
    (source, index, self) => index === self.findIndex((s) => s.url === source.url)
  );

  const { text } = await generateText({
    model: getResearchModel(),
    system: systemPrompt,
    prompt: `Original Query: ${plan.originalQuery}
Clarified Query: ${plan.clarifiedQuery}

Draft Report:
${draft.content}

Available Sources:
${uniqueSources.map((s) => `- [${s.title}](${s.url})`).join('\n')}

Create the final, polished version of this research report.`,
    temperature: getProviderTemperature(0.7),
    abortSignal,
  });

  // Extract title from the report (first # heading)
  const titleMatch = text.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : plan.clarifiedQuery;

  const report: FinalReport = {
    title,
    content: text,
    citations: uniqueSources,
    generatedAt: new Date(),
  };

  emit({
    type: 'final_report',
    report,
    timestamp: new Date(),
  });

  return report;
}

/**
 * Helper to check if research has been aborted
 */
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Research cancelled');
  }
}

/**
 * Main orchestration function - runs the complete deep research workflow
 */
export async function runDeepResearch(
  userQuery: string,
  emit: EventEmitter,
  config: Partial<DeepResearchConfig> = {}
): Promise<DeepResearchState> {
  const state = createInitialState(userQuery, config);
  const maxIterations = config.maxIterations ?? 3;
  const abortSignal = config.abortSignal;

  try {
    // Check if search is available
    if (!isSearchAvailable()) {
      console.warn('[DEEP-RESEARCH] Search API not configured, using mock data');
    }

    // Phase 1: Planning
    checkAborted(abortSignal);
    state.currentPhase = 'planning';
    state.plan = await planResearch(state, emit, abortSignal);

    // Phase 2: Generate search queries
    checkAborted(abortSignal);
    const searchQueries = await generateSearchQueries(state.plan, emit, abortSignal);
    state.totalSearches = searchQueries.length;

    // Phase 3: Execute searches
    checkAborted(abortSignal);
    state.currentPhase = 'searching';
    state.findings = await executeResearchSearches(searchQueries, emit, config);
    state.completedSearches = state.findings.length;

    // Phase 4: Generate initial draft
    checkAborted(abortSignal);
    state.currentPhase = 'drafting';
    state.draftReport = await generateDraftReport(state.plan, state.findings, emit, abortSignal);

    // Phase 5: Iterative refinement loop
    for (let i = 0; i < maxIterations - 1; i++) {
      checkAborted(abortSignal);
      state.iteration = i + 1;
      state.currentPhase = 'refining';

      const { gaps, searches } = await refineDraft(state.draftReport, state.plan, emit, abortSignal);

      // If no significant gaps, break early
      if (gaps.length === 0 || searches.length === 0) {
        emit({
          type: 'analysis_update',
          message: 'No significant gaps found, proceeding to final report.',
          timestamp: new Date(),
        });
        break;
      }

      // Execute additional searches for gaps
      checkAborted(abortSignal);
      const additionalFindings = await executeResearchSearches(
        searches.slice(0, 5), // Limit additional searches
        emit,
        config
      );
      state.findings.push(...additionalFindings);

      // Regenerate draft with new findings
      checkAborted(abortSignal);
      state.draftReport = await generateDraftReport(state.plan, state.findings, emit, abortSignal);
      state.draftReport.iteration = i + 2;
      state.draftReport.informationGaps = gaps;
    }

    // Phase 6: Generate final report
    checkAborted(abortSignal);
    state.currentPhase = 'finalizing';
    state.finalReport = await generateFinalReport(
      state.draftReport,
      state.plan,
      state.findings,
      emit,
      abortSignal
    );

    // Complete
    state.currentPhase = 'complete';
    emit({
      type: 'complete',
      state,
      timestamp: new Date(),
    });

    return state;
  } catch (error) {
    // Don't emit error for cancellation - it's expected behavior
    const isCancelled = error instanceof Error && error.message === 'Research cancelled';

    state.currentPhase = 'error';
    state.error = error instanceof Error ? error.message : 'Unknown error';

    if (!isCancelled) {
      emit({
        type: 'error',
        error: state.error,
        timestamp: new Date(),
      });
    }

    throw error;
  }
}

