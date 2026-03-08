#!/usr/bin/env npx tsx
/**
 * Vector Search EXTREME Diagnosis Framework
 * 
 * HARD MODE: 20 challenging test cases × 15 configurations
 */

import path from "path";
import fs from "fs";

require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });

import { searchVectorDB, type VectorSearchHit } from "@/lib/vectordb/search";
import { hybridSearchV2 } from "@/lib/vectordb/v2/hybrid-search";
import {
    updateVectorSearchConfig,
    resetVectorSearchConfig,
    type VectorSearchV2Config
} from "@/lib/config/vector-search";

const CHARACTER_ID = "14c4efbe-ec8a-4c74-9db5-64ecae7dedd0";
const RESULTS_DIR = path.join(process.cwd(), "scripts", "diagnosis-results");

interface TestCase {
    id: string;
    query: string;
    expectedPatterns: string[];
    description: string;
    difficulty: "EASY" | "MEDIUM" | "HARD" | "EXTREME";
}

// ============================================================================
// 20 EXTREME TEST CASES
// ============================================================================

const TEST_CASES: TestCase[] = [
    // === EXACT FILE/FUNCTION NAME TESTS ===
    {
        id: "exact-filename-1",
        query: "generate-lesson-with-audio",
        expectedPatterns: ["generate-lesson-with-audio"],
        description: "Exact edge function folder name only",
        difficulty: "EXTREME",
    },
    {
        id: "exact-filename-2",
        query: "supabase/functions/generate-lesson-with-audio/index.ts",
        expectedPatterns: ["generate-lesson-with-audio", "index.ts"],
        description: "Full path to file",
        difficulty: "EXTREME",
    },
    {
        id: "exact-filename-3",
        query: "generate-meditation index.ts supabase",
        expectedPatterns: ["generate-meditation", "supabase"],
        description: "Another edge function by name",
        difficulty: "HARD",
    },

    // === API/CODE PATTERN TESTS ===
    {
        id: "openai-api-method",
        query: "client.audio.speech.create mp3 tts-1",
        expectedPatterns: ["audio", "speech", "create", "mp3"],
        description: "OpenAI TTS exact API call",
        difficulty: "EXTREME",
    },
    {
        id: "deno-serve-pattern",
        query: "Deno.serve(async (req) => { const",
        expectedPatterns: ["Deno", "serve", "req"],
        description: "Deno serve exact pattern",
        difficulty: "EXTREME",
    },
    {
        id: "fetch-response-pattern",
        query: "return new Response(JSON.stringify",
        expectedPatterns: ["Response", "JSON", "stringify"],
        description: "HTTP response pattern",
        difficulty: "HARD",
    },

    // === ERROR HANDLING TESTS ===
    {
        id: "4096-limit-exact",
        query: "4096",
        expectedPatterns: ["4096"],
        description: "Just the number",
        difficulty: "EXTREME",
    },
    {
        id: "string-too-long-exact",
        query: "string_too_long",
        expectedPatterns: ["string", "long"],
        description: "Exact error code underscore",
        difficulty: "EXTREME",
    },
    {
        id: "error-handling-try-catch",
        query: "try catch error openai audio",
        expectedPatterns: ["try", "catch", "error", "audio"],
        description: "Error handling pattern",
        difficulty: "MEDIUM",
    },

    // === SEMANTIC UNDERSTANDING TESTS ===
    {
        id: "semantic-workflow",
        query: "how is lesson audio created from text",
        expectedPatterns: ["lesson", "audio", "text"],
        description: "Natural language workflow question",
        difficulty: "MEDIUM",
    },
    {
        id: "semantic-problem",
        query: "why would TTS fail with long text",
        expectedPatterns: ["tts", "fail", "text", "long"],
        description: "Problem-oriented query",
        difficulty: "HARD",
    },
    {
        id: "semantic-solution",
        query: "fix audio generation failure retry mechanism",
        expectedPatterns: ["audio", "generation", "retry"],
        description: "Solution-oriented query",
        difficulty: "MEDIUM",
    },

    // === SPECIFIC IMPLEMENTATION TESTS ===
    {
        id: "retry-max-attempts",
        query: "maxRetries attempts 3 failed generation",
        expectedPatterns: ["retry", "3", "failed"],
        description: "Retry configuration",
        difficulty: "HARD",
    },
    {
        id: "word-limit-prompt",
        query: "700 750 words limit lesson script prompt",
        expectedPatterns: ["700", "750", "words", "limit"],
        description: "Word limit in prompts",
        difficulty: "EXTREME",
    },
    {
        id: "voice-model-names",
        query: "alloy echo fable onyx nova shimmer voice",
        expectedPatterns: ["alloy", "echo", "nova", "voice"],
        description: "OpenAI voice model names",
        difficulty: "EXTREME",
    },

    // === DATABASE/SCHEMA TESTS ===
    {
        id: "prompts-table-content",
        query: "INSERT INTO prompts lesson_audio_script",
        expectedPatterns: ["prompts", "lesson", "audio"],
        description: "SQL insert for prompts",
        difficulty: "HARD",
    },
    {
        id: "usage-tracking",
        query: "lesson_audio_generations usage tracking metered",
        expectedPatterns: ["lesson_audio_generations", "usage"],
        description: "Usage metrics tracking",
        difficulty: "MEDIUM",
    },

    // === EDGE CASE TESTS ===
    {
        id: "single-word-audio",
        query: "audio",
        expectedPatterns: ["audio"],
        description: "Single generic word",
        difficulty: "EXTREME",
    },
    {
        id: "single-word-deno",
        query: "Deno",
        expectedPatterns: ["Deno"],
        description: "Single specific word",
        difficulty: "EXTREME",
    },
    {
        id: "mixed-case-search",
        query: "OPENAI tts TEXT speech AUDIO",
        expectedPatterns: ["openai", "tts", "speech", "audio"],
        description: "Mixed case query",
        difficulty: "MEDIUM",
    },
];

// ============================================================================
// 15 CONFIGURATION VARIATIONS
// ============================================================================

interface ParameterConfig {
    name: string;
    description: string;
    config: Partial<VectorSearchV2Config>;
    minScore: number;
    topK: number;
}

const PARAMETER_CONFIGS: ParameterConfig[] = [
    // === BASELENE CONFIGS ===
    {
        name: "v1-baselene-strict",
        description: "V1 with strict threshold",
        config: { enableHybridSearch: false, searchMode: "semantic" },
        minScore: 0.5,
        topK: 10,
    },
    {
        name: "v1-baselene-normal",
        description: "V1 with normal threshold",
        config: { enableHybridSearch: false, searchMode: "semantic" },
        minScore: 0.3,
        topK: 15,
    },
    {
        name: "v1-baselene-loose",
        description: "V1 with loose threshold",
        config: { enableHybridSearch: false, searchMode: "semantic" },
        minScore: 0.1,
        topK: 20,
    },
    {
        name: "v1-ultra-loose",
        description: "V1 catching everything",
        config: { enableHybridSearch: false, searchMode: "semantic" },
        minScore: 0.01,
        topK: 50,
    },

    // === HYBRID CONFIGS ===
    {
        name: "hybrid-balanced",
        description: "Hybrid with balanced weights",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.0,
            lexicalWeight: 1.0,
            rrfK: 60,
        },
        minScore: 0.1,
        topK: 20,
    },
    {
        name: "hybrid-semantic-heavy",
        description: "Hybrid favoring semantic",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 3.0,
            lexicalWeight: 0.5,
            rrfK: 30,
        },
        minScore: 0.1,
        topK: 20,
    },
    {
        name: "hybrid-lexical-heavy",
        description: "Hybrid favoring keywords",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 0.5,
            lexicalWeight: 3.0,
            rrfK: 30,
        },
        minScore: 0.1,
        topK: 20,
    },
    {
        name: "hybrid-extreme-lexical",
        description: "Hybrid almost pure lexical",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 0.1,
            lexicalWeight: 5.0,
            rrfK: 20,
        },
        minScore: 0.05,
        topK: 30,
    },

    // === RRF TUNING ===
    {
        name: "hybrid-low-rrfk",
        description: "Low RRF K (more top-heavy)",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.8,
            rrfK: 10,
        },
        minScore: 0.1,
        topK: 20,
    },
    {
        name: "hybrid-high-rrfk",
        description: "High RRF K (more distributed)",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.8,
            rrfK: 100,
        },
        minScore: 0.1,
        topK: 20,
    },

    // === WITH FEATURES ===
    {
        name: "hybrid-with-expansion",
        description: "Hybrid with query expansion",
        config: {
            enableHybridSearch: true,
            enableQueryExpansion: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.5,
            rrfK: 30,
        },
        minScore: 0.1,
        topK: 20,
    },
    {
        name: "hybrid-with-rerank",
        description: "Hybrid with reranking",
        config: {
            enableHybridSearch: true,
            enableReranking: true,
            searchMode: "hybrid",
            denseWeight: 1.5,
            lexicalWeight: 0.5,
            rrfK: 30,
            rerankTopK: 30,
        },
        minScore: 0.1,
        topK: 20,
    },

    // === OPTIMAL VARIATIONS ===
    {
        name: "optimal-v1",
        description: "Optimal V1 attempt",
        config: {
            enableHybridSearch: false,
            searchMode: "semantic",
        },
        minScore: 0.15,
        topK: 30,
    },
    {
        name: "optimal-v2",
        description: "Optimal V2 attempt",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 2.0,
            lexicalWeight: 1.0,
            rrfK: 40,
        },
        minScore: 0.05,
        topK: 30,
    },
    {
        name: "optimal-v3-max-recall",
        description: "Maximum recall configuration",
        config: {
            enableHybridSearch: true,
            searchMode: "hybrid",
            denseWeight: 1.0,
            lexicalWeight: 2.0,
            rrfK: 50,
        },
        minScore: 0.01,
        topK: 50,
    },
];

// ============================================================================
// METRICS
// ============================================================================

interface TestResult {
    testCase: TestCase;
    config: ParameterConfig;
    hits: VectorSearchHit[];
    metrics: {
        hitCount: number;
        patternsFound: number;
        patternsCoverage: number;
        avgScore: number;
        topScore: number;
        lowScore: number;
        uniqueFiles: number;
        relevantFiles: string[];
        foundExactMatch: boolean; // Did we find the expected file?
    };
    duration: number;
}

function calculateMetrics(testCase: TestCase, hits: VectorSearchHit[]): TestResult["metrics"] {
    if (hits.length === 0) {
        return {
            hitCount: 0, patternsFound: 0, patternsCoverage: 0,
            avgScore: 0, topScore: 0, lowScore: 0,
            uniqueFiles: 0, relevantFiles: [], foundExactMatch: false,
        };
    }

    const scores = hits.map(h => h.score);
    const uniqueFiles = [...new Set(hits.map(h => h.relativePath))];

    const allText = hits.map(h => `${h.relativePath} ${h.text}`).join(" ").toLowerCase();
    const patternsFound = testCase.expectedPatterns.filter(p =>
        allText.includes(p.toLowerCase())
    );

    const relevantFiles = uniqueFiles.filter(file => {
        const fileLower = file.toLowerCase();
        return testCase.expectedPatterns.some(p => fileLower.includes(p.toLowerCase()));
    });

    // Check for exact match in file paths
    const foundExactMatch = uniqueFiles.some(file =>
        testCase.expectedPatterns.some(p => file.toLowerCase().includes(p.toLowerCase()))
    );

    return {
        hitCount: hits.length,
        patternsFound: patternsFound.length,
        patternsCoverage: patternsFound.length / testCase.expectedPatterns.length,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        topScore: Math.max(...scores),
        lowScore: Math.min(...scores),
        uniqueFiles: uniqueFiles.length,
        relevantFiles,
        foundExactMatch,
    };
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTest(testCase: TestCase, paramConfig: ParameterConfig): Promise<TestResult> {
    resetVectorSearchConfig();
    updateVectorSearchConfig(paramConfig.config);

    const startTime = Date.now();
    let hits: VectorSearchHit[];

    try {
        if (paramConfig.config.enableHybridSearch) {
            hits = await hybridSearchV2({
                characterId: CHARACTER_ID,
                query: testCase.query,
                options: { topK: paramConfig.topK, minScore: paramConfig.minScore },
            });
        } else {
            hits = await searchVectorDB({
                characterId: CHARACTER_ID,
                query: testCase.query,
                options: { topK: paramConfig.topK, minScore: paramConfig.minScore },
            });
        }
    } catch (error) {
        console.error(`Error: ${testCase.id}/${paramConfig.name}:`, error);
        hits = [];
    }

    return {
        testCase,
        config: paramConfig,
        hits,
        metrics: calculateMetrics(testCase, hits),
        duration: Date.now() - startTime,
    };
}

async function runAllTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    console.log(`\n${"=".repeat(80)}`);
    console.log(`EXTREME VECTOR SEARCH DIAGNOSIS`);
    console.log(`Character ID: ${CHARACTER_ID}`);
    console.log(`Test Cases: ${TEST_CASES.length} (${TEST_CASES.filter(t => t.difficulty === "EXTREME").length} EXTREME)`);
    console.log(`Configurations: ${PARAMETER_CONFIGS.length}`);
    console.log(`Total Tests: ${TEST_CASES.length * PARAMETER_CONFIGS.length}`);
    console.log(`${"=".repeat(80)}\n`);

    for (const config of PARAMETER_CONFIGS) {
        console.log(`\n--- ${config.name} ---`);
        console.log(`${config.description} | minScore: ${config.minScore}, topK: ${config.topK}`);

        let passed = 0, partial = 0, failed = 0;

        for (const testCase of TEST_CASES) {
            process.stdout.write(`  [${testCase.difficulty}] ${testCase.id.padEnd(25)}... `);

            const result = await runTest(testCase, config);
            results.push(result);

            const { metrics } = result;

            if (metrics.patternsCoverage >= 0.75) {
                console.log(`✓ ${metrics.hitCount} hits, ${(metrics.patternsCoverage * 100).toFixed(0)}%, ${result.duration}ms`);
                passed++;
            } else if (metrics.hitCount > 0 && metrics.patternsCoverage > 0) {
                console.log(`~ ${metrics.hitCount} hits, ${(metrics.patternsCoverage * 100).toFixed(0)}%, ${result.duration}ms`);
                partial++;
            } else {
                console.log(`✗ ${metrics.hitCount} hits, 0%, ${result.duration}ms`);
                failed++;
            }
        }

        console.log(`  Summary: ✓${passed} ~${partial} ✗${failed}`);
    }

    return results;
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(results: TestResult[]): string {
    const lines: string[] = [];

    lines.push("# EXTREME Vector Search Diagnosis Report");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Total Tests: ${results.length}`);
    lines.push("");

    // Summary by config
    const byConfig = new Map<string, TestResult[]>();
    for (const r of results) {
        const existing = byConfig.get(r.config.name) || [];
        existing.push(r);
        byConfig.set(r.config.name, existing);
    }

    lines.push("## Summary by Configuration");
    lines.push("");
    lines.push("| Config | Pass | Partial | Fail | Avg Coverage | Avg Hits | Score |");
    lines.push("|--------|------|---------|------|--------------|----------|-------|");

    const configScores: { name: string; score: number }[] = [];

    for (const [configName, configResults] of byConfig) {
        const passed = configResults.filter(r => r.metrics.patternsCoverage >= 0.75).length;
        const partial = configResults.filter(r => r.metrics.patternsCoverage > 0 && r.metrics.patternsCoverage < 0.75).length;
        const failed = configResults.filter(r => r.metrics.patternsCoverage === 0).length;
        const avgCoverage = configResults.reduce((a, r) => a + r.metrics.patternsCoverage, 0) / configResults.length;
        const avgHits = configResults.reduce((a, r) => a + r.metrics.hitCount, 0) / configResults.length;

        // Weighted score: coverage is most important, then pass rate, then hits
        const score = avgCoverage * 0.5 + (passed / configResults.length) * 0.3 + Math.min(avgHits / 20, 1) * 0.2;
        configScores.push({ name: configName, score });

        lines.push(
            `| ${configName} | ${passed} | ${partial} | ${failed} | ${(avgCoverage * 100).toFixed(0)}% | ${avgHits.toFixed(1)} | ${score.toFixed(3)} |`
        );
    }

    // Summary by difficulty
    lines.push("");
    lines.push("## Summary by Difficulty");
    lines.push("");

    const byDifficulty = new Map<string, TestResult[]>();
    for (const r of results) {
        const d = r.testCase.difficulty;
        const existing = byDifficulty.get(d) || [];
        existing.push(r);
        byDifficulty.set(d, existing);
    }

    lines.push("| Difficulty | Avg Coverage | Best Config | Worst Config |");
    lines.push("|------------|--------------|-------------|--------------|");

    for (const difficulty of ["EASY", "MEDIUM", "HARD", "EXTREME"]) {
        const diffResults = byDifficulty.get(difficulty);
        if (!diffResults) continue;

        const avgCoverage = diffResults.reduce((a, r) => a + r.metrics.patternsCoverage, 0) / diffResults.length;

        // Find best/worst config for this difficulty
        const byConfigForDiff = new Map<string, number>();
        for (const r of diffResults) {
            const current = byConfigForDiff.get(r.config.name) || 0;
            byConfigForDiff.set(r.config.name, current + r.metrics.patternsCoverage);
        }

        let best = "", worst = "";
        let bestScore = -1, worstScore = 999;
        for (const [name, total] of byConfigForDiff) {
            if (total > bestScore) { bestScore = total; best = name; }
            if (total < worstScore) { worstScore = total; worst = name; }
        }

        lines.push(`| ${difficulty} | ${(avgCoverage * 100).toFixed(0)}% | ${best} | ${worst} |`);
    }

    // Top recommendations
    lines.push("");
    lines.push("## 🏆 Top Recommendations");
    lines.push("");

    configScores.sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(3, configScores.length); i++) {
        const { name, score } = configScores[i];
        const config = PARAMETER_CONFIGS.find(c => c.name === name)!;
        lines.push(`${i + 1}. **${name}** (score: ${score.toFixed(3)})`);
        lines.push(`   - minScore: ${config.minScore}, topK: ${config.topK}`);
        lines.push(`   - ${JSON.stringify(config.config)}`);
        lines.push("");
    }

    return lines.join("\n");
}

function saveResults(results: TestResult[], report: string): void {
    if (!fs.existsSync(RESULTS_DIR)) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    fs.writeFileSync(path.join(RESULTS_DIR, `extreme-results-${timestamp}.json`), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(RESULTS_DIR, `extreme-report-${timestamp}.md`), report);
    fs.writeFileSync(path.join(RESULTS_DIR, "extreme-report-latest.md"), report);

    console.log(`\nResults saved to: scripts/diagnosis-results/`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    try {
        const results = await runAllTests();
        const report = generateReport(results);

        console.log("\n" + "=".repeat(80));
        console.log("EXTREME DIAGNOSIS COMPLETE");
        console.log("=".repeat(80) + "\n");

        console.log(report.split("## Summary by Difficulty")[0]);

        saveResults(results, report);

    } catch (error) {
        console.error("Diagnosis failed:", error);
        process.exit(1);
    }
}

main();
