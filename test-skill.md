# Test Skill

A simple test skill for upload testing.

## Description

This is a minimal skill package to test the upload flow.

## Scripts

### greet

```typescript
export async function greet(name: string) {
  return `Hello, ${name}! This is a test skill.`;
}
```

### calculate

```typescript
export async function calculate(a: number, b: number, operation: string) {
  switch (operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      return b !== 0 ? a / b : 'Cannot divide by zero';
    default:
      return 'Unknown operation';
  }
}
```
