#!/usr/bin/env tsx
import { db } from '../lib/db/sqlite-client';
import { messages } from '../lib/db/sqlite-schema';
import { eq } from 'drizzle-orm';

const MESSAGE_ID = '44a8e4d6-e7a4-4d27-a5a6-3fbf6ba31772'; // First flagged message

async function main() {
  const msg = await db.query.messages.findFirst({
    where: eq(messages.id, MESSAGE_ID),
  });
  
  if (!msg) {
    console.log('Message not found');
    return;
  }
  
  console.log('\n📄 Message Details:\n');
  console.log(`ID: ${msg.id}`);
  console.log(`Role: ${msg.role}`);
  console.log(`Created: ${msg.createdAt}`);
  console.log(`Token Count: ${msg.tokenCount}`);
  console.log(`\nContent (formatted):\n`);
  console.log(JSON.stringify(msg.content, null, 2));
}

main().catch(console.error);
