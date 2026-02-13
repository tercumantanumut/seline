#!/usr/bin/env tsx
/**
 * Check messages from a specific session to see if fake tool JSON is present
 */

import { db } from '../lib/db/sqlite-client';
import { messages } from '../lib/db/sqlite-schema';
import { eq, asc } from 'drizzle-orm';

const SESSION_ID = '5295ea89-67cc-44a4-90da-5b68c498a8cc'; // From latest test run

async function main() {
  console.log(`\n🔍 Checking session: ${SESSION_ID}\n`);
  
  const allMessages = await db.query.messages.findMany({
    where: eq(messages.sessionId, SESSION_ID),
    orderBy: asc(messages.createdAt),
  });
  
  console.log(`Total messages: ${allMessages.length}\n`);
  
  // Check each assistant message for fake JSON
  const fakeJsonPatterns = [
    /\{"type"\s*:\s*"tool-call"/g,
    /\{"type"\s*:\s*"tool-result"/g,
    /\[SYSTEM:\s*Tool\s+\w+\s+was previously called/g,
  ];
  
  let issuesFound = 0;
  
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    
    if (msg.role === 'assistant') {
      const contentStr = JSON.stringify(msg.content);
      
      let hasFakeJson = false;
      const instances: string[] = [];
      
      for (const pattern of fakeJsonPatterns) {
        const matches = contentStr.match(pattern);
        if (matches) {
          hasFakeJson = true;
          instances.push(...matches);
        }
      }
      
      if (hasFakeJson) {
        issuesFound++;
        console.log(`\n❌ Message #${i + 1} (${msg.id}) contains fake tool JSON:`);
        console.log(`   Created: ${msg.createdAt}`);
        console.log(`   Instances: ${instances.length}`);
        console.log(`   Patterns: ${instances.join(', ')}`);
        console.log(`\n   Content preview:`);
        console.log(`   ${contentStr.substring(0, 500)}...\n`);
      }
    }
  }
  
  if (issuesFound === 0) {
    console.log('✅ No fake tool JSON detected in any messages');
  } else {
    console.log(`\n⚠️  Found fake JSON in ${issuesFound} messages`);
  }
}

main().catch(console.error);
