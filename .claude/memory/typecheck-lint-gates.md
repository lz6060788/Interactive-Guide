---
name: typecheck-lint-gates
description: Code quality gate configuration, common failures, and fix patterns
metadata:
  type: project
---

# Typecheck & Lint Gates

## Pre-commit Hooks

Configured in `.claude/settings.json` as Stop hooks:
1. **TypeScript typecheck**: `npx tsc --noEmit` — must pass with zero errors
2. **ESLint**: `npx eslint src/ tests/ --max-warnings 0` — must pass with zero errors AND zero warnings

Both run before git commit. Failures block the commit.

**Why:** These hooks were added as P2 remediation from the codebase audit to prevent regressions.

**How to apply:** When a commit is blocked by these hooks, read the hook output to identify the issue, fix it, then retry the commit.

## PostToolUse Hook

- Triggered on `Write|Edit` to `.ts`/`.tsx` files
- Runs `npx tsc --noEmit` to catch type errors immediately after file changes

## ESLint Configuration

Config at `eslint.config.mjs`:
- Parser: `@typescript-eslint/parser`
- Extends: `@typescript-eslint/recommended`
- Ignores: `node_modules/`, `dist/`, `.claude/`, `data/`, `tmp/`, `*.js`, `*.mjs`, `**/vendor/`
- Key rules:
  - `@typescript-eslint/no-explicit-any`: off (intentional for rapid prototyping)
  - `@typescript-eslint/no-unused-vars`: warn — `_`-prefixed args, vars, and caught errors are ignored
  - `@typescript-eslint/ban-types`: disabled from recommended
  - `@typescript-eslint/no-this-alias`: off
  - `@typescript-eslint/no-unsafe-function-type`: off

## Common Fix Patterns

### Unused imports
- Remove the import entirely if not used
- If importing for type only, use `import type { ... }`

### Unused variables (destructured from spread)
- Use `_` prefix: `const { unused: _unused, ...rest } = obj`
- The `varsIgnorePattern: '^_'` ESLint option suppresses these

### Unused function parameters
- Use `_` prefix: `function foo(_unusedParam: string)`
- The `argsIgnorePattern: '^_'` ESLint option suppresses these

### Unused caught errors
- Use bare `catch` instead of `catch (e)`
- Or `catch (_e)` with `caughtErrorsIgnorePattern: '^_'`

## Test Commands

```bash
# Typecheck
npx tsc --noEmit

# ESLint
npx eslint src/ tests/ --max-warnings 0

# Tests
node --import tsx --test tests/**/*.test.ts
```
