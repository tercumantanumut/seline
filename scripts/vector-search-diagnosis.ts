#!/usr/bin/env npx ts-node
/**
 * Vector Search Diagnosis & Optimization Framework
 * 
 * Runs systematic tests with different parameter configurations
 * to find optimal settings for semantic search quality.
 * 
 * Usage:
 *   npx ts-node scripts/vector-search-diagnosis.ts
 *   npx ts-node scripts/vector-search-diagnosis.ts --run=v1-baselene
 */

import path from "path";
import fs from "fs";

// Load environment before imports
require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

import { searchVectorDB, type VectorSearchHit } from "@/lib/vectordb/search";
import { hybridSearchV2 } from "@/lib/vectordb/v2/hybrid-search";
import {
    updateVectorSearchConfig,
    resetVectorSearchConfig,
    getVectorSearchConfig,
    type VectorSearchV2Config
} from "@/lib/config/vector-search";

// ============================================================================
// Configuration
// ============================================================================

const CHARACTER_ID = "14c4efbe-ec8a-4c74-9db5-64ecae7dedd0";
const RESULTS_DIR = path.join(process.cwd(), "scripts", "diagnosis-results");

// Test cases with ground truth (files we expect to find)
interface TestCase {
    id: string;
    query: string;
    expectedPatterns: string[];  // Patterns that SHOULD appear in results
    description: string;
}

const TEST_CASES: TestCase[] = [
    // HARD: Very specific function names that should be found
    {
        id: "exact-edge-function-name",
        query: "generate-lesson-with-audio index.ts",
        expectedPatterns: ["generate-lesson-with-audio", "index.ts"],
        description: "Find edge function by exact folder name",
    },
    {
        id: "exact-function-name-no-extension",
        query: "generate-lesson-with-audio supabase function",
        expectedPatterns: ["generate-lesson-with-audio", "supabase", "function"],
        description: "Find edge function without file extension",
    },
    // HARD: Technical terms that may not embeddings well
    {
        id: "openai-tts-api-call",
        query: "client.audio.speech.create TTS API call",
        expectedPatterns: ["audio", "speech", "create", "client"],
        description: "Find OpenAI TTS API usage",
    },
    {
        id: "4096-char-limit",
        query: "4096 character limit string too long error",
        expectedPatterns: ["4096", "character", "limit", "error"],
        description: "Find code handling TTS length limits",
    },
    // HARD: Specific error messages
    {
        id: "string-too-long-error",
        query: "string_too_long error message handling",
        expectedPatterns: ["string", "long", "error"],
        description: "Find error handling for string too long",
    },
    // HARD: Implementation details
    {
        id: "retry-count-3",
        query: "retry 3 times after failure audio generation",
        expectedPatterns: ["retry", "3", "failure", "audio"],
        description: "Find retry logic with count",
    },
    // HARD: Specific path patterns
    {
        id: "supabase-functions-folder",
        query: "supabase/functions folder edge function handler",
        expectedPatterns: ["supabase/functions", "edge", "handler"],
        description: "Find files in supabase/functions",
    },
    // HARD: Database/migration files
    {
        id: "prompts-table-lesson",
        query: "prompts table lesson audio script generation",
        expectedPatterns: ["prompts", "lesson", "script", "audio"],
        description: "Find prompt definitions for lessons",
    },
    // HARD: Very abstract query
    {
        id: "abstract-audio-workflow",
        query: "how does lesson audio generation work end to end",
        expectedPatterns: ["lesson", "audio", "generation"],
        description: "Abstract query about audio generation flow",
    },
    // HARD: Mixed terminology
    {
        id: "voice-synthesis-openai",
        query: "voice synthesis text-to-speech OpenAI alloy nova",
        expectedPatterns: ["voice", "speech", "openai"],
        description: "Find voice/TTS with model names",
    },
    // VERY HARD: Exact function call
    {
        id: "exact-code-pattern",
        query: "Deno.serve async req Request",
        expectedPatterns: ["Deno", "serve", "Request"],
        description: "Find Deno serve pattern in edge functions",
    },
    // VERY HARD: Error code
    {
        id: "error-code-search",
        query: "error 400 bad request openai api",
        expectedPatterns: ["400", "error", "openai"],
        description: "Find API error handling",
    },
];

// Parameter configurations to test
interface ParameterConfig {
    name: string;
    description: string;
    config: Partial<VectorSearchV2Config>;
    minScore: number;
    topK: number;
}

const PARAMETER_CONFIGS: ParameterConfig[] = [
    {
        name: "v1-baselene",
        description: "Default V1 configuration (semantic only)",
        config: {
            enableHybridSearch: false,
            enableReranking: false,
            enableQueryExpansion: false,
            searchMode: "semantic",
        },
        minScore: 0.3,
        topK: 15,
    },
    {
        name: "low-threshold",
        description: "Lower minScore threshold to catch more results",
        config: {
            enableHybridSearch: false,
            searchMode: "semantic",
        },
        minScore: 0.1,
        topK: 15,
    },
    {
        name: "very-low-threshold",
        description: "Very low minScore to see full score distribution",
        config: {
            enableHybridSearch: false,
            searchMode: "semantic",
        },
        minScore: 0.05,
        topK: 30,
    },
    {
        name: "hybrid-basic",
        description: "Enable hybrid search (dense + lexical)",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.2,
            rrfK: 30,
        },
        minScore: 0.3,
        topK: 15,
    },
    {
        name: "hybrid-low-threshold",
        description: "Hybrid search with lower threshold",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.2,
            rrfK: 30,
        },
        minScore: 0.1,
        topK: 15,
    },
    {
        name: "query-expansion",
        description: "Enable query expansion for synonyms",
        config: {
            enableHybridSearch: true,
            enableQueryExpansion: true,
            searchMode: "hybrid",
        },
        minScore: 0.1,
        topK: 15,
    },
    {
        name: "dense-heavy",
        description: "Higher weight on semantic matching",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 2.5,
            lexicalWeight: 0.2,
            rrfK: 30,
        },
        minScore: 0.1,
        topK: 15,
    },
    {
        name: "lexical-boost",
        description: "Higher weight on keyword matching",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.8,
            rrfK: 30,
        },
        minScore: 0.1,
        topK: 15,
    },
    {
        name: "with-reranking",
        description: "Enable cross-encoder reranking",
        config: {
            enableHybridSearch: true,
            enableReranking: true,
            searchMode: "hybrid",
            rerankTopK: 20,
        },
        minScore: 0.1,
        topK: 15,
    },
    {
        name: "optimal-combo",
        description: "Combined optimal settings (will be adjusted)",
        config: {
            enableHybridSearch: true,
            enableQueryExpansion: false,  // Often adds noise
            enableReranking: false,        // Unless model available
            searchMode: "hybrid",
            denseWeight: 2.0,
            lexicalWeight: 0.5,
            rrfK: 30,
        },
        minScore: 0.15,
        topK: 20,
    },
];

// ============================================================================
// Metrics
// ============================================================================

interface TestResult {
    testCase: TestCase;
    config: ParameterConfig;
    hits: VectorSearchHit[];
    metrics: {
        hitCount: number;
        patternsFound: number;
        patternsCoverage: number;  // % of expected patterns found
        avgScore: number;
        topScore: number;
        lowScore: number;
        uniqueFiles: number;
        relevantFiles: string[];  // Files matching expected patterns
    };
    duration: number;
}

function calculateMetrics(
    testCase: TestCase,
    hits: VectorSearchHit[]
): TestResult["metrics"] {
    if (hits.length === 0) {
        return {
            hitCount: 0,
            patternsFound: 0,
            patternsCoverage: 0,
            avgScore: 0,
            topScore: 0,
            lowScore: 0,
            uniqueFiles: 0,
            relevantFiles: [],
        };
    }

    const scores = hits.map(h => h.score);
    const uniqueFiles = [...new Set(hits.map(h => h.relativePath))];

    // Check which expected patterns appear in results
    const allText = hits.map(h => `${h.relativePath} ${h.text}`).join(" ").toLowerCase();
    const patternsFound = testCase.expectedPatterns.filter(p =>
        allText.includes(p.toLowerCase())
    );

    // Find files that contain expected patterns
    const relevantFiles = uniqueFiles.filter(file => {
        const fileLower = file.toLowerCase();
        return testCase.expectedPatterns.some(p => fileLower.includes(p.toLowerCase()));
    });

    return {
        hitCount: hits.length,
        patternsFound: patternsFound.length,
        patternsCoverage: patternsFound.length / testCase.expectedPatterns.length,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        topScore: Math.max(...scores),
        lowScore: Math.min(...scores),
        uniqueFiles: uniqueFiles.length,
        relevantFiles,
    };
}

// ============================================================================
// Test Runner
// ============================================================================

async function runTest(
    testCase: TestCase,
    paramConfig: ParameterConfig
): Promise<TestResult> {
    // Apply configuration
    resetVectorSearchConfig();
    updateVectorSearchConfig(paramConfig.config);

    const startTime = Date.now();

    let hits: VectorSearchHit[];

    try {
        if (paramConfig.config.enableHybridSearch) {
            hits = await hybridSearchV2({
                characterId: CHARACTER_ID,
                query: testCase.query,
                options: {
                    topK: paramConfig.topK,
                    minScore: paramConfig.minScore,
                },
            });
        } else {
            hits = await searchVectorDB({
                characterId: CHARACTER_ID,
                query: testCase.query,
                options: {
                    topK: paramConfig.topK,
                    minScore: paramConfig.minScore,
                },
            });
        }
    } catch (error) {
        console.error(`Error in test ${testCase.id}/${paramConfig.name}:`, error);
        hits = [];
    }

    const duration = Date.now() - startTime;
    const metrics = calculateMetrics(testCase, hits);

    return {
        testCase,
        config: paramConfig,
        hits,
        metrics,
        duration,
    };
}

async function runAllTests(configName?: string): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const configs = configName
        ? PARAMETER_CONFIGS.filter(c => c.name === configName)
        : PARAMETER_CONFIGS;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`VECTOR SEARCH DIAGNOSIS`);
    console.log(`Character ID: ${CHARACTER_ID}`);
    console.log(`Test Cases: ${TEST_CASES.length}`);
    console.log(`Configurations: ${configs.length}`);
    console.log(`${"=".repeat(80)}\n`);

    for (const config of configs) {
        console.log(`\n--- Configuration: ${config.name} ---`);
        console.log(`Description: ${config.description}`);
        console.log(`minScore: ${config.minScore}, topK: ${config.topK}`);
        console.log(`Settings: ${JSON.stringify(config.config)}\n`);

        for (const testCase of TEST_CASES) {
            process.stdout.write(`  Testing "${testCase.id}"... `);

            const result = await runTest(testCase, config);
            results.push(result);

            const { metrics } = result;
            const status = metrics.patternsCoverage >= 0.5 ? "✓" : metrics.hitCount > 0 ? "~" : "✗";

            console.log(
                `${status} ${metrics.hitCount} hits, ` +
                `${(metrics.patternsCoverage * 100).toFixed(0)}% patterns, ` +
                `scores: ${metrics.topScore.toFixed(3)}-${metrics.lowScore.toFixed(3)}, ` +
                `${result.duration}ms`
            );

            // Show top 3 files found
            if (metrics.relevantFiles.length > 0) {
                console.log(`     Relevant: ${metrics.relevantFiles.slice(0, 3).join(", ")}`);
            }
        }
    }

    return results;
}

// ============================================================================
// Reporting
// ============================================================================

function generateReport(results: TestResult[]): string {
    const lines: string[] = [];

    lines.push("# Vector Search Diagnosis Report");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Character ID: ${CHARACTER_ID}`);
    lines.push("");

    // Group by config
    const byConfig = new Map<string, TestResult[]>();
    for (const r of results) {
        const existing = byConfig.get(r.config.name) || [];
        existing.push(r);
        byConfig.set(r.config.name, existing);
    }

    // Summary table
    lines.push("## Summary by Configuration");
    lines.push("");
    lines.push("| Config | Avg Hits | Avg Coverage | Avg Score | Total Relevant |");
    lines.push("|--------|----------|--------------|-----------|----------------|");

    for (const [configName, configResults] of byConfig) {
        const avgHits = configResults.reduce((a, r) => a + r.metrics.hitCount, 0) / configResults.length;
        const avgCoverage = configResults.reduce((a, r) => a + r.metrics.patternsCoverage, 0) / configResults.length;
        const avgScore = configResults.reduce((a, r) => a + r.metrics.avgScore, 0) / configResults.length;
        const totalRelevant = configResults.reduce((a, r) => a + r.metrics.relevantFiles.length, 0);

        lines.push(
            `| ${configName} | ${avgHits.toFixed(1)} | ${(avgCoverage * 100).toFixed(0)}% | ${avgScore.toFixed(3)} | ${totalRelevant} |`
        );
    }

    lines.push("");
    lines.push("## Detailed Results");
    lines.push("");

    for (const [configName, configResults] of byConfig) {
        lines.push(`### ${configName}`);
        lines.push("");

        for (const r of configResults) {
            lines.push(`#### ${r.testCase.id}: "${r.testCase.query}"`);
            lines.push(`- Hits: ${r.metrics.hitCount}`);
            lines.push(`- Pattern Coverage: ${(r.metrics.patternsCoverage * 100).toFixed(0)}%`);
            lines.push(`- Score Range: ${r.metrics.topScore.toFixed(3)} - ${r.metrics.lowScore.toFixed(3)}`);
            lines.push(`- Duration: ${r.duration}ms`);

            if (r.metrics.relevantFiles.length > 0) {
                lines.push(`- Relevant Files Found: ${r.metrics.relevantFiles.join(", ")}`);
            }

            if (r.hits.length > 0) {
                lines.push(`- Top Results:`);
                for (const hit of r.hits.slice(0, 5)) {
                    lines.push(`  - \`${hit.relativePath}\` (score: ${hit.score.toFixed(3)}, lines: ${hit.startLine || "?"}-${hit.endLine || "?"})`);
                }
            }
            lines.push("");
        }
    }

    // Score distribution analysis
    lines.push("## Score Distribution Analysis");
    lines.push("");

    for (const [configName, configResults] of byConfig) {
        const allScores = configResults.flatMap(r => r.hits.map(h => h.score));
        if (allScores.length === 0) continue;

        const sorted = allScores.sort((a, b) => b - a);
        const p25 = sorted[Math.floor(sorted.length * 0.25)];
        const p50 = sorted[Math.floor(sorted.length * 0.50)];
        const p75 = sorted[Math.floor(sorted.length * 0.75)];

        lines.push(`### ${configName}`);
        lines.push(`- Total scores: ${sorted.length}`);
        lines.push(`- P25: ${p25?.toFixed(3) || "N/A"}, P50: ${p50?.toFixed(3) || "N/A"}, P75: ${p75?.toFixed(3) || "N/A"}`);
        lines.push(`- Min: ${sorted[sorted.length - 1]?.toFixed(3) || "N/A"}, Max: ${sorted[0]?.toFixed(3) || "N/A"}`);
        lines.push("");
    }

    return lines.join("\n");
}

function saveResults(results: TestResult[], report: string): void {
    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_DIR)) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Save JSON results
    const jsonPath = path.join(RESULTS_DIR, `results-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${jsonPath}`);

    // Save Markdown report
    const mdPath = path.join(RESULTS_DIR, `report-${timestamp}.md`);
    fs.writeFileSync(mdPath, report);
    console.log(`Report saved to: ${mdPath}`);

    // Save latest symlink
    const latestJsonPath = path.join(RESULTS_DIR, "results-latest.json");
    const latestMdPath = path.join(RESULTS_DIR, "report-latest.md");

    try {
        if (fs.existsSync(latestJsonPath)) fs.unlinkSync(latestJsonPath);
        if (fs.existsSync(latestMdPath)) fs.unlinkSync(latestMdPath);
    } catch { }

    fs.writeFileSync(latestJsonPath, JSON.stringify(results, null, 2));
    fs.writeFileSync(latestMdPath, report);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    const args = process.argv.slice(2);
    const runArg = args.find(a => a.startsWith("--run="));
    const configName = runArg?.split("=")[1];

    try {
        const results = await runAllTests(configName);
        const report = generateReport(results);

        console.log("\n" + "=".repeat(80));
        console.log("DIAGNOSIS COMPLETE");
        console.log("=".repeat(80) + "\n");

        // Print summary to console
        console.log(report.split("## Detailed Results")[0]);

        saveResults(results, report);

        // Find best config
        const byConfig = new Map<string, TestResult[]>();
        for (const r of results) {
            const existing = byConfig.get(r.config.name) || [];
            existing.push(r);
            byConfig.set(r.config.name, existing);
        }

        let bestConfig = "";
        let bestScore = -1;

        for (const [configName, configResults] of byConfig) {
            const avgCoverage = configResults.reduce((a, r) => a + r.metrics.patternsCoverage, 0) / configResults.length;
            const avgHits = configResults.reduce((a, r) => a + r.metrics.hitCount, 0) / configResults.length;
            const score = avgCoverage * 0.7 + Math.min(avgHits / 10, 1) * 0.3;  // Weighted score

            if (score > bestScore) {
                bestScore = score;
                bestConfig = configName;
            }
        }

        console.log(`\n🏆 RECOMMENDED CONFIG: ${bestConfig} (score: ${bestScore.toFixed(3)})`);
        const recommended = PARAMETER_CONFIGS.find(c => c.name === bestConfig);
        if (recommended) {
            console.log(`   minScore: ${recommended.minScore}`);
            console.log(`   topK: ${recommended.topK}`);
            console.log(`   Settings: ${JSON.stringify(recommended.config, null, 2)}`);
        }

    } catch (error) {
        console.error("Diagnosis failed:", error);
        process.exit(1);
    }
}

main();
