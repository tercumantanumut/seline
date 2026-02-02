/**
 * Calculator Tool
 *
 * AI tool for safe, accurate mathematical calculations.
 * Uses mathjs library for expression parsing and evaluation.
 * This offloads math from the LLM to get deterministic, correct results.
 */

import { tool, jsonSchema } from "ai";
import { create, all } from "mathjs";

/**
 * Create a restricted mathjs instance for safe evaluation
 */
const math = create(all);

// Remove potentially dangerous functions
const limitedMath = math.create(all, {
    // Limit precision for performance
    number: "number",
    precision: 14,
});

// Disable file system and other potentially dangerous functions
const dangerousFunctions = [
    "import",
    "createUnit",
    "evaluate",
    "parse",
    "compile",
    "parser",
    "chain",
    "help",
    "config",
];

dangerousFunctions.forEach((fn) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (limitedMath as unknown as Record<string, unknown>)[fn];
    } catch {
        // Ignore if function doesn't exist
    }
});

/**
 * Input type for the calculator tool
 */
interface CalculatorInput {
    expression: string;
    precision?: number;
}

/**
 * Result type for the calculator tool
 */
interface CalculatorResult {
    success: boolean;
    expression: string;
    result?: string | number;
    error?: string;
    type?: string;
}

/**
 * JSON Schema definition for the calculator tool input
 */
const calculatorSchema = jsonSchema<CalculatorInput>({
    type: "object",
    title: "CalculatorInput",
    description: "Input schema for mathematical calculations",
    properties: {
        expression: {
            type: "string",
            description:
                'Mathematical expression to evaluate. Supports arithmetic, functions, constants. Examples: "2 + 2 * 3", "sqrt(16)", "sin(pi/2)", "12345 * 67890", "10000 * (1 + 0.07)^30"',
        },
        precision: {
            type: "number",
            description:
                "Number of decimal places for the result (default: 10). Use higher values for financial calculations.",
        },
    },
    required: ["expression"],
    additionalProperties: false,
});

/**
 * Safely evaluate a mathematical expression
 */
function safeEvaluate(
    expression: string,
    precision: number = 10
): CalculatorResult {
    // Input validation
    if (!expression || typeof expression !== "string") {
        return {
            success: false,
            expression: expression || "",
            error: "Expression must be a non-empty string",
        };
    }

    const trimmedExpr = expression.trim();

    // Block potentially dangerous patterns
    const unsafePatterns = [
        /\bimport\b/i,
        /\brequire\b/i,
        /\beval\b/i,
        /\bfunction\b/i,
        /\bnew\s+Function\b/i,
        /\bprocess\b/i,
        /`/,
        /\$\{/,
    ];

    for (const pattern of unsafePatterns) {
        if (pattern.test(trimmedExpr)) {
            return {
                success: false,
                expression: trimmedExpr,
                error: "Expression contains unsafe patterns",
            };
        }
    }

    try {
        // Evaluate using the limited mathjs instance
        const result = limitedMath.evaluate(trimmedExpr);

        // Format the result
        if (result === undefined || result === null) {
            return {
                success: false,
                expression: trimmedExpr,
                error: "Expression returned no result",
            };
        }

        // Handle different result types
        if (typeof result === "number") {
            // Handle special numbers
            if (!isFinite(result)) {
                if (isNaN(result)) {
                    return {
                        success: false,
                        expression: trimmedExpr,
                        error: "Result is NaN (Not a Number) - check your expression",
                    };
                }
                return {
                    success: true,
                    expression: trimmedExpr,
                    result: result > 0 ? "Infinity" : "-Infinity",
                    type: "infinity",
                };
            }

            // Round to specified precision
            const roundedResult = Number(result.toPrecision(precision));
            return {
                success: true,
                expression: trimmedExpr,
                result: roundedResult,
                type: "number",
            };
        }

        // Handle matrix results
        if (result.constructor && result.constructor.name === "Matrix") {
            return {
                success: true,
                expression: trimmedExpr,
                result: result.toString(),
                type: "matrix",
            };
        }

        // Handle complex numbers
        if (result.re !== undefined && result.im !== undefined) {
            return {
                success: true,
                expression: trimmedExpr,
                result: result.toString(),
                type: "complex",
            };
        }

        // Handle boolean results
        if (typeof result === "boolean") {
            return {
                success: true,
                expression: trimmedExpr,
                result: result ? "true" : "false",
                type: "boolean",
            };
        }

        // Handle unit results
        if (result.value !== undefined && result.unit !== undefined) {
            return {
                success: true,
                expression: trimmedExpr,
                result: result.toString(),
                type: "unit",
            };
        }

        // Generic stringification for other types
        return {
            success: true,
            expression: trimmedExpr,
            result: result.toString(),
            type: typeof result,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
        return {
            success: false,
            expression: trimmedExpr,
            error: `Calculation error: ${errorMessage}`,
        };
    }
}

/**
 * Create the calculator AI tool
 */
export function createCalculatorTool() {
    return tool({
        description: `Perform accurate mathematical calculations. Use this tool instead of computing math yourself.

**Capabilities:**
- Arithmetic: +, -, *, /, ^, %, sqrt, cbrt
- Trigonometry: sin, cos, tan, asin, acos, atan (uses radians)
- Logarithms: log, log10, log2, exp
- Constants: pi, e, phi (golden ratio), tau
- Statistics: mean, median, std, variance, sum, prod
- Matrix: [[1,2],[3,4]] * [[5,6],[7,8]]
- Units: "5 miles to km", "100 fahrenheit to celsius"
- Complex: "2 + 3i"

**Examples:**
- "2 + 2 * 3" → 8
- "sqrt(16) + cbrt(27)" → 7
- "sin(pi/2)" → 1
- "10000 * (1 + 0.07)^30" → 76122.55 (compound interest)
- "mean([85, 90, 78, 92, 88])" → 86.6
- "5 miles to km" → 8.047 km`,

        inputSchema: calculatorSchema,

        execute: async (input: CalculatorInput): Promise<CalculatorResult> => {
            const { expression, precision = 10 } = input;

            // Clamp precision to reasonable range
            const clampedPrecision = Math.max(1, Math.min(precision, 20));

            const result = safeEvaluate(expression, clampedPrecision);

            // Log for debugging
            if (result.success) {
                console.log(
                    `[calculator] ${result.expression} = ${result.result} (${result.type})`
                );
            } else {
                console.log(
                    `[calculator] Error evaluating "${result.expression}": ${result.error}`
                );
            }

            return result;
        },
    });
}
