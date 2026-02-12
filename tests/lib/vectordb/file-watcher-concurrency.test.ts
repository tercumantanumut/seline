import { describe, it, expect } from "vitest";

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

describe("Concurrency Tests", () => {
    it("Should process all 5 items", async () => {
        const items = [1, 2, 3, 4, 5];
        const processed: number[] = [];

        await processWithConcurrency(items, 2, async (item) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            processed.push(item);
        });

        expect(processed.length).toBe(5);
        items.forEach(i => expect(processed.includes(i)).toBe(true));
    });

    it("Should process 4 items (skipping failed one)", async () => {
        const items = [1, 2, 3, 4, 5];
        const processed: number[] = [];

        await processWithConcurrency(items, 2, async (item) => {
            if (item === 3) throw new Error("Fail");
            await new Promise(resolve => setTimeout(resolve, 10));
            processed.push(item);
        });

        expect(processed.length).toBe(4);
        expect(processed.includes(3)).toBe(false);
    });

    it("Max active should be <= concurrency (2)", async () => {
        const items = [1, 2, 3, 4, 5];
        let maxActive = 0;
        let currentActive = 0;

        await processWithConcurrency(items, 2, async (item) => {
            currentActive++;
            if (currentActive > maxActive) maxActive = currentActive;

            await new Promise(resolve => setTimeout(resolve, 20));

            currentActive--;
        });

        expect(maxActive).toBeLessThanOrEqual(2);
    });
});
