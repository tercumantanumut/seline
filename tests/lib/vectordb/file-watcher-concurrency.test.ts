
import assert from "assert";

console.log("Running Concurrency Tests...");

async function processWithConcurrency<T>(
    items: T[],
    concurrency: number,
    handler: (item: T) => Promise<void>
): Promise<void> {
    const queue = [...items];
    const active: Promise<void>[] = [];

    while (queue.length > 0 || active.length > 0) {
        while (queue.length > 0 && active.length < concurrency) {
            const item = queue.shift()!;

            const promise = handler(item);
            active.push(promise);

            promise.finally(() => {
                const index = active.indexOf(promise);
                if (index > -1) active.splice(index, 1);
            }).catch(() => { });
        }

        if (active.length > 0) {
            try {
                await Promise.race(active);
            } catch (e) {
                // Ignore errors in race
            }
        }
    }
}

async function runTests() {
    try {
        // Test 1: Process all items
        {
            const items = [1, 2, 3, 4, 5];
            const processed: number[] = [];

            await processWithConcurrency(items, 2, async (item) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                processed.push(item);
            });

            assert.strictEqual(processed.length, 5, "Should process all 5 items");
            items.forEach(i => assert.ok(processed.includes(i), `Should include ${i}`));
        }

        // Test 2: Error handling
        {
            const items = [1, 2, 3, 4, 5];
            const processed: number[] = [];

            await processWithConcurrency(items, 2, async (item) => {
                if (item === 3) throw new Error("Fail");
                await new Promise(resolve => setTimeout(resolve, 10));
                processed.push(item);
            });

            // Should process all except 3
            assert.strictEqual(processed.length, 4, "Should process 4 items (skipping failed one)");
            assert.ok(!processed.includes(3), "Should not include failed item 3");
        }

        // Test 3: Concurrency Limit
        {
            const items = [1, 2, 3, 4, 5];
            let maxActive = 0;
            let currentActive = 0;

            await processWithConcurrency(items, 2, async (item) => {
                currentActive++;
                if (currentActive > maxActive) maxActive = currentActive;

                await new Promise(resolve => setTimeout(resolve, 20));

                currentActive--;
            });

            assert.ok(maxActive <= 2, `Max active (${maxActive}) should be <= concurrency (2)`);
        }

        console.log("✅ All Concurrency Tests Passed!");
    } catch (e: any) {
        console.error("❌ Test Failed:", e.message);
        process.exit(1);
    }
}

runTests();
