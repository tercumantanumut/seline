#!/usr/bin/env tsx
/**
 * Fake Tool Call Issue Reproduction Script - SLOW MODE
 * 
 * This script connects to the live Seline dev server and drives a conversation
 * with Kimi 2.5 to reproduce the issue where the model outputs fake tool call
 * JSON as plain text instead of using structured tool calls.
 * 
 * SLOW MODE: Longer delays, more deliberate interruptions, simulates real user behavior
 * 
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Ensure Kimi API key is configured in settings
 *   3. Run: tsx scripts/reproduce-fake-tool-call.ts
 * 
 * The script will:
 *   - Create a new chat session
 *   - Force Kimi 2.5 model selection
 *   - Drive turns with SLOW, DELIBERATE interruptions to trigger state corruption
 *   - Capture full message history after each turn
 *   - Detect and log any fake tool call JSON in responses
 *   - Save diagnostics to scripts/diagnosis-results/fake-tool-call-TIMESTAMP.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ============================================================================
// SLOW MODE CONFIGURATION - ADJUST THESE FOR MORE REALISTIC TIMING
// ============================================================================
const SLOW_CONFIG = {
  // Base delays between turns (simulating user reading/thinking time)
  baseDelayMs: 8000,           // 8 seconds base delay (was 3s)
  delayAfterAbortMs: 5000,     // 5 seconds after abort (was 2s)
  delayAfterErrorMs: 10000,    // 10 seconds after error (was 5s)
  
  // Interruption timing - let the agent work longer before interrupting
  abortMinMs: 5000,            // Minimum 5 seconds before abort (was 2s)
  abortMaxMs: 12000,           // Maximum 12 seconds before abort (was 5s)
  
  // Interruption strategy - fewer but more deliberate interruptions
  interruptChance: 0.25,       // 25% chance (was 40%)
  interruptStartTurn: 3,       // Start interrupting at turn 3
  interruptEndTurn: 25,        // Continue through turn 25
  
  // Consecutive interruption patterns (simulates user frustration/impatience)
  maxConsecutiveInterrupts: 2, // Max 2 interrupts in a row
  consecutiveInterruptChance: 0.6, // 60% chance to interrupt again after first
  
  // Tool call detection - wait for tool calls before interrupting
  waitForToolCallMs: 3000,     // Wait at least 3s to see if tools are invoked
  
  // Session pacing
  turnsPerPhase: 4,            // Number of turns per phase
  phaseBreakDelayMs: 15000,    // 15 second break between phases
};

// Configuration
const CONFIG = {
  serverUrl: 'http://localhost:3000',
  model: 'kimi-k2.5', // Most susceptible to the issue
  provider: 'kimi',
  sessionId: randomUUID(),
  characterId: '', // Will be populated from first agent found
  outputDir: path.join(process.cwd(), 'scripts', 'diagnosis-results'),
  targetTurns: 24, // More turns for slow mode
  sessionCookie: '', // Will be populated after authentication
};

// Test prompts designed to trigger heavy tool usage and create realistic work scenarios
// SLOW MODE: More complex prompts that take longer to process, increasing interrupt opportunities
const TEST_PROMPTS = [
  // Phase 1: Normal operation - establish baseline (turns 1-4)
  "Hello! I need to understand this codebase. Please search for TypeScript files that handle API routes and give me a comprehensive overview of the routing architecture.",
  "Great overview! Now read the main chat API route file and explain the key functions and how they handle streaming.",
  "Perfect. Now search for any database schema files related to messages and sessions, and summarize the data model.",
  "Based on what you've found, can you create a diagram or detailed explanation of how data flows from the user message through to the database?",
  
  // Phase 2: SLOW INTERRUPT ZONE - Let agent start working, then interrupt (turns 5-8)
  // These prompts are designed to take longer, giving us more time to interrupt mid-thought
  "Now I want you to create a comprehensive test suite for the entire API layer. Start by analyzing all the existing test patterns in the codebase, identify gaps in coverage, and create a detailed plan for improving test coverage across all critical paths...",
  "Actually, wait. I've been thinking about authentication. Tell me about the architecture of the authentication system - how does it handle sessions, tokens, and security?",
  "Hold on, let me stop you there. Go back to the API tests idea. But first, search for all files related to user sessions and middleware, and tell me how they interact.",
  "Actually, never mind all that. Read the main database connection file and explain the connection pooling strategy and how it handles concurrent connections.",
  
  // Phase 3: Frustration simulation - rapid context switches (turns 9-12)
  "Stop. I need you to create a new feature: add rate limiting to the chat API. Start by searching for existing rate limit implementations in the codebase and analyzing different approaches...",
  "Hmm, actually I changed my mind completely. What was the first thing I asked you? Can you summarize our entire conversation so far, step by step?",
  "Okay but really, I need you to search for files with 'tool' in the name and tell me which one handles tool calls and how the registry works.",
  "Read that file you just found. But only the first 50 lines. Actually, you know what, read all of it and give me the complete picture.",
  
  // Phase 4: Deep work interruption - complex multi-step tasks (turns 13-16)
  "Now create a new file called 'chaos-test.ts' that imports all the tools and demonstrates their usage. But wait, before you do that, search for the tool registry and understand how tools are registered and discovered...",
  "Forget everything we just discussed. Start completely fresh. What files are in the scripts directory and what does each one do?",
  "Read the package.json file carefully. What's the project name, version, and all the dependencies? Give me a breakdown of the tech stack.",
  "Actually I don't care about that. Search for all files that mention 'Kimi' or 'moonshot' and tell me how the integration works.",
  
  // Phase 5: Tool call heavy with strategic interruptions (turns 17-20)
  "Read one of those Kimi integration files. Then tell me what you think about the weather today - just kidding, analyze the code instead.",
  "Search for all TypeScript files in the lib directory, then read each one and create a comprehensive summary document of the entire architecture...",
  "Stop! Don't do all that. Just search for files with 'prompt' in the name and tell me how the system prompts are constructed.",
  "Read the system prompt file. But explain it like I'm five years old - simple language, analogies, the works.",
  
  // Phase 6: Final stress test - rapid fire (turns 21-24)
  "Now search for files that handle streaming responses and explain the SSE protocol implementation.",
  "Create a file called 'test.txt' with the content 'hello world'. Then delete it. Then create it again with different content. Then tell me what you did.",
  "What was the last file you read? Read it again but this time focus on any error handling patterns you missed the first time.",
  "Search for the word 'async' in all JavaScript and TypeScript files. Count how many times it appears and tell me where it's used most.",
  "Finally, summarize everything we've discussed in this conversation and create a markdown report. But make it rhyme - yes, like a poem.",
];

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | unknown[];
  parts?: Array<{
    type: string;
    text?: string;
    toolName?: string;
    toolCallId?: string;
    args?: unknown;
    result?: unknown;
  }>;
}

interface TurnResult {
  turnNumber: number;
  userMessage: string;
  assistantResponse: string;
  wasAborted: boolean;
  abortDelayMs?: number;
  containsFakeToolJson: boolean;
  fakeJsonInstances: string[];
  messageHistory: Message[];
  timestamp: string;
}

// Regex patterns to detect fake tool call JSON
const FAKE_JSON_PATTERNS = [
  /\{"type"\s*:\s*"tool-call"/g,
  /\{"type"\s*:\s*"tool-result"/g,
  /\[SYSTEM:\s*Tool\s+readFile\s+was previously called/g,
  /\[SYSTEM:\s*Tool\s+\w+\s+was previously called/g,
];

// Track consecutive interruptions
let consecutiveInterrupts = 0;
let lastWasInterrupted = false;

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect fake tool call JSON in text
 */
function detectFakeToolJson(text: string): { found: boolean; instances: string[] } {
  const instances: string[] = [];
  
  for (const pattern of FAKE_JSON_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      instances.push(...matches);
    }
  }
  
  return {
    found: instances.length > 0,
    instances: Array.from(new Set(instances)), // Deduplicate
  };
}

/**
 * Authenticate and get session cookie
 */
async function authenticate(): Promise<string> {
  console.log('🔐 Authenticating...');
  
  // Try to login with provided credentials
  const loginResponse = await fetch(`${CONFIG.serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'umut@rltm.ai',
      password: 'Kreatorn01.',
    }),
  });
  
  if (loginResponse.ok) {
    const setCookie = loginResponse.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/zlutty-session=([^;]+)/);
      if (match) {
        const data = await loginResponse.json();
        console.log(`✅ Authenticated as ${data.user?.email || 'umut@rltm.ai'}`);
        return match[1];
      }
    }
  }
  
  // Try alternate password
  console.log('⚠️  First password failed, trying alternate...');
  const loginResponse2 = await fetch(`${CONFIG.serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'umut@rltm.ai',
      password: 'Kreatorn001.',
    }),
  });
  
  if (loginResponse2.ok) {
    const setCookie = loginResponse2.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/zlutty-session=([^;]+)/);
      if (match) {
        const data = await loginResponse2.json();
        console.log(`✅ Authenticated as ${data.user?.email || 'umut@rltm.ai'}`);
        return match[1];
      }
    }
  }
  
  throw new Error('Login failed with both passwords');
}

/**
 * Send a chat message and wait for response
 * Supports aborting the stream mid-response to simulate user interruptions
 */
async function sendMessage(
  sessionId: string,
  message: string,
  messageHistory: Message[],
  options: {
    abortAfterMs?: number;
    turnNumber?: number;
  } = {}
): Promise<{ response: string; updatedHistory: Message[]; aborted: boolean; abortDelayMs?: number }> {
  console.log(`\n📤 Sending (Turn ${options.turnNumber}): "${message.substring(0, 80)}..."`);
  
  const userMessage: Message = {
    role: 'user',
    content: message,
  };
  
  const requestBody = {
    messages: [...messageHistory, userMessage],
    sessionId,
  };
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Session-Id': sessionId,
    'Cookie': `zlutty-session=${CONFIG.sessionCookie}`,
  };
  
  // Add character ID if we have one
  if (CONFIG.characterId) {
    headers['X-Character-Id'] = CONFIG.characterId;
  }
  
  const abortController = new AbortController();
  let abortTimeout: NodeJS.Timeout | null = null;
  let abortDelayMs: number | undefined;
  
  // Set up abort timer if requested
  if (options.abortAfterMs) {
    abortDelayMs = options.abortAfterMs;
    abortTimeout = setTimeout(() => {
      console.log(`\n⚠️  ABORTING after ${abortDelayMs}ms (simulating user stop)...`);
      abortController.abort();
    }, options.abortAfterMs);
  }
  
  const response = await fetch(`${CONFIG.serverUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal: abortController.signal,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  // Stream the response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }
  
  const decoder = new TextDecoder();
  let assistantResponse = '';
  let buffer = '';
  let aborted = false;
  let chunkCount = 0;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      
      // Parse Server-Sent Events (SSE) format
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // AI SDK format: "0:" for text deltas
        if (line.startsWith('0:')) {
          try {
            const jsonStr = line.substring(2).trim();
            const parsed = JSON.parse(jsonStr);
            if (typeof parsed === 'string') {
              assistantResponse += parsed;
              // Only print every 10th chunk to reduce console spam
              if (chunkCount % 10 === 0) {
                process.stdout.write('.');
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    if (chunkCount > 0) process.stdout.write('\n');
  } catch (error: any) {
    if (error.name === 'AbortError') {
      aborted = true;
      console.log('\n🛑 Stream aborted mid-response');
    } else {
      throw error;
    }
  } finally {
    if (abortTimeout) {
      clearTimeout(abortTimeout);
    }
    await reader.cancel().catch(() => {});
  }
  
  if (!aborted) {
    console.log(`✅ Response received (${assistantResponse.length} chars, ${chunkCount} chunks)`);
  }
  
  const assistantMessage: Message = {
    role: 'assistant',
    content: assistantResponse,
  };
  
  return {
    response: assistantResponse,
    updatedHistory: [...messageHistory, userMessage, assistantMessage],
    aborted,
    abortDelayMs,
  };
}

/**
 * Force Kimi model selection and get first agent
 */
async function configureSession(sessionCookie: string): Promise<void> {
  console.log(`🔧 Configuring Kimi 2.5...`);
  
  // Force Kimi provider
  const settingsResponse = await fetch(`${CONFIG.serverUrl}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `zlutty-session=${sessionCookie}`,
    },
    body: JSON.stringify({
      llmProvider: 'kimi',
      chatModel: 'kimi-k2.5',
      toolLoadingMode: 'always',
    }),
  });
  
  if (!settingsResponse.ok) {
    console.warn('⚠️  Could not update settings - continuing anyway');
  } else {
    console.log('✅ Forced Kimi 2.5 model with ALL tools enabled');
  }
  
  // Get first agent/character
  const charactersResponse = await fetch(`${CONFIG.serverUrl}/api/characters`, {
    headers: {
      'Cookie': `zlutty-session=${sessionCookie}`,
    },
  });
  
  if (charactersResponse.ok) {
    const data = await charactersResponse.json();
    if (data.characters && data.characters.length > 0) {
      CONFIG.characterId = data.characters[0].id;
      console.log(`✅ Using agent: ${data.characters[0].name} (${CONFIG.characterId})`);
    } else {
      console.log('⚠️  No agents found - will use default chat');
    }
  } else {
    console.log('⚠️  Could not fetch agents - will use default chat');
  }
}

/**
 * Save diagnostics to file
 */
async function saveDiagnostics(results: TurnResult[]): Promise<string> {
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `fake-tool-call-SLOW-${timestamp}.json`;
  const filepath = path.join(CONFIG.outputDir, filename);
  
  const diagnostics = {
    config: CONFIG,
    slowConfig: SLOW_CONFIG,
    timestamp: new Date().toISOString(),
    totalTurns: results.length,
    issuesDetected: results.filter(r => r.containsFakeToolJson).length,
    abortCount: results.filter(r => r.wasAborted).length,
    results,
    summary: {
      firstIssueAtTurn: results.find(r => r.containsFakeToolJson)?.turnNumber || null,
      totalFakeJsonInstances: results.reduce((sum, r) => sum + r.fakeJsonInstances.length, 0),
      consecutiveInterruptPattern: consecutiveInterrupts,
    },
  };
  
  await fs.writeFile(filepath, JSON.stringify(diagnostics, null, 2), 'utf-8');
  console.log(`\n💾 Diagnostics saved to: ${filepath}`);
  
  return filepath;
}

/**
 * Determine if we should interrupt this turn based on slow mode logic
 */
function shouldInterruptTurn(turnNumber: number): { should: boolean; delayMs?: number } {
  // Check if we're in the interrupt zone
  if (turnNumber < SLOW_CONFIG.interruptStartTurn || turnNumber > SLOW_CONFIG.interruptEndTurn) {
    return { should: false };
  }
  
  // Handle consecutive interrupt pattern
  if (lastWasInterrupted) {
    if (consecutiveInterrupts >= SLOW_CONFIG.maxConsecutiveInterrupts) {
      // Force a normal turn after max consecutive interrupts
      console.log(`   📋 Forcing normal turn after ${consecutiveInterrupts} consecutive interrupts`);
      consecutiveInterrupts = 0;
      return { should: false };
    }
    // Chance to continue interrupting
    if (Math.random() < SLOW_CONFIG.consecutiveInterruptChance) {
      consecutiveInterrupts++;
      const delayMs = Math.floor(Math.random() * (SLOW_CONFIG.abortMaxMs - SLOW_CONFIG.abortMinMs)) + SLOW_CONFIG.abortMinMs;
      return { should: true, delayMs };
    } else {
      consecutiveInterrupts = 0;
      return { should: false };
    }
  }
  
  // Base interrupt chance
  if (Math.random() < SLOW_CONFIG.interruptChance) {
    consecutiveInterrupts = 1;
    const delayMs = Math.floor(Math.random() * (SLOW_CONFIG.abortMaxMs - SLOW_CONFIG.abortMinMs)) + SLOW_CONFIG.abortMinMs;
    return { should: true, delayMs };
  }
  
  return { should: false };
}

/**
 * Main reproduction flow - SLOW MODE
 */
async function main() {
  console.log('🐌 Fake Tool Call Reproduction Script - SLOW MODE');
  console.log('===================================================\n');
  console.log(`Server: ${CONFIG.serverUrl}`);
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Session ID: ${CONFIG.sessionId}`);
  console.log(`Target turns: ${CONFIG.targetTurns}`);
  console.log('\n📊 SLOW MODE Settings:');
  console.log(`   Base delay: ${SLOW_CONFIG.baseDelayMs}ms`);
  console.log(`   Abort timing: ${SLOW_CONFIG.abortMinMs}-${SLOW_CONFIG.abortMaxMs}ms`);
  console.log(`   Interrupt chance: ${SLOW_CONFIG.interruptChance * 100}%`);
  console.log(`   Max consecutive interrupts: ${SLOW_CONFIG.maxConsecutiveInterrupts}\n`);
  
  // Verify server is running
  try {
    const healthCheck = await fetch(`${CONFIG.serverUrl}/`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    if (healthCheck.status === 0 || healthCheck.status >= 500) {
      throw new Error('Server returned error status');
    }
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Server is not running. Start it with: npm run dev');
    process.exit(1);
  }
  
  // Authenticate and get session cookie
  CONFIG.sessionCookie = await authenticate();
  
  // Configure Kimi and get agent
  await configureSession(CONFIG.sessionCookie);
  
  // Initial pause to let everything settle
  console.log(`\n⏳ Initial settling period (${SLOW_CONFIG.baseDelayMs}ms)...`);
  await sleep(SLOW_CONFIG.baseDelayMs);
  
  // Run conversation with SLOW CHAOS MODE
  const results: TurnResult[] = [];
  let messageHistory: Message[] = [];
  let issueDetected = false;
  let currentPhase = 1;
  
  for (let i = 0; i < Math.min(TEST_PROMPTS.length, CONFIG.targetTurns); i++) {
    const turnNumber = i + 1;
    const prompt = TEST_PROMPTS[i];
    
    // Check for phase transition
    const newPhase = Math.floor(i / SLOW_CONFIG.turnsPerPhase) + 1;
    if (newPhase !== currentPhase) {
      currentPhase = newPhase;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔄 PHASE ${currentPhase} STARTING`);
      console.log(`   Taking a ${SLOW_CONFIG.phaseBreakDelayMs}ms break...`);
      console.log('='.repeat(60));
      await sleep(SLOW_CONFIG.phaseBreakDelayMs);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Turn ${turnNumber}/${CONFIG.targetTurns} | Phase ${currentPhase}`);
    console.log('='.repeat(60));
    
    // Determine if we should interrupt this turn
    const interruptDecision = shouldInterruptTurn(turnNumber);
    const shouldInterrupt = interruptDecision.should;
    const abortAfterMs = interruptDecision.delayMs;
    
    if (shouldInterrupt && abortAfterMs) {
      console.log(`⚡ SLOW CHAOS: Will abort after ${abortAfterMs}ms (${consecutiveInterrupts} consecutive)`);
    } else {
      console.log(`📋 Normal turn - allowing completion`);
      consecutiveInterrupts = 0;
    }
    
    try {
      const { response, updatedHistory, aborted, abortDelayMs } = await sendMessage(
        CONFIG.sessionId,
        prompt,
        messageHistory,
        { abortAfterMs, turnNumber }
      );
      
      messageHistory = updatedHistory;
      lastWasInterrupted = aborted;
      
      // Check for fake tool JSON
      const detection = detectFakeToolJson(response);
      
      if (detection.found && !issueDetected) {
        console.log('\n🔴🔴🔴 ISSUE DETECTED! Fake tool call JSON found in response! 🔴🔴🔴');
        console.log(`   Instances: ${detection.instances.join(', ')}`);
        issueDetected = true;
      }
      
      results.push({
        turnNumber,
        userMessage: prompt,
        assistantResponse: response,
        wasAborted: aborted,
        abortDelayMs,
        containsFakeToolJson: detection.found,
        fakeJsonInstances: detection.instances,
        messageHistory: JSON.parse(JSON.stringify(messageHistory)),
        timestamp: new Date().toISOString(),
      });
      
      // SLOW MODE: Realistic delays between turns
      let delayMs: number;
      if (aborted) {
        delayMs = SLOW_CONFIG.delayAfterAbortMs;
        console.log(`   ⏱️  Waiting ${delayMs}ms after abort for state to settle...`);
      } else {
        delayMs = SLOW_CONFIG.baseDelayMs;
        console.log(`   ⏱️  Waiting ${delayMs}ms (simulating user reading/thinking)...`);
      }
      await sleep(delayMs);
      
    } catch (error) {
      console.error(`\n❌ Error on turn ${turnNumber}:`, error);
      results.push({
        turnNumber,
        userMessage: prompt,
        assistantResponse: `ERROR: ${error}`,
        wasAborted: false,
        containsFakeToolJson: false,
        fakeJsonInstances: [],
        messageHistory: JSON.parse(JSON.stringify(messageHistory)),
        timestamp: new Date().toISOString(),
      });
      lastWasInterrupted = false;
      consecutiveInterrupts = 0;
      
      console.log(`   ⏱️  Waiting ${SLOW_CONFIG.delayAfterErrorMs}ms after error...`);
      await sleep(SLOW_CONFIG.delayAfterErrorMs);
    }
  }
  
  // Save diagnostics
  const filepath = await saveDiagnostics(results);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY - SLOW MODE');
  console.log('='.repeat(60));
  console.log(`Total turns: ${results.length}`);
  console.log(`Aborts/interruptions: ${results.filter(r => r.wasAborted).length}`);
  console.log(`Issues detected: ${results.filter(r => r.containsFakeToolJson).length}`);
  
  const firstIssue = results.find(r => r.containsFakeToolJson);
  if (firstIssue) {
    console.log(`First issue at turn: ${firstIssue.turnNumber}`);
    console.log(`Total fake JSON instances: ${results.reduce((sum, r) => sum + r.fakeJsonInstances.length, 0)}`);
    console.log(`\n🔴 REPRODUCTION SUCCESSFUL - Issue detected!`);
    console.log(`   Review diagnostics at: ${filepath}`);
  } else {
    console.log(`\n🟢 No issues detected in ${results.length} turns`);
    console.log(`   This may indicate the issue is fixed or requires different timing`);
  }
  
  console.log('\n✅ Script complete');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
