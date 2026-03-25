---
name: coding-style
description: Code style guidelines and conventions for the Moca project
---

# Coding Style Guide

This document defines the code style and conventions for the Moca project.

## Language

!IMPORTANT RULE: Unless explicitly specified, please implement documentation and code in English even if requested in Japanese.


## TypeScript Configuration

### Strict Mode
All packages use TypeScript strict mode:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

### Type Safety
- Always provide explicit types for function parameters and return values
- Avoid using `any` type - use `unknown` or proper types instead
- Use type guards for runtime type checking

**Good:**
```typescript
function processUser(user: User): string {
  return user.name;
}
```

**Bad:**
```typescript
function processUser(user: any) {
  return user.name;
}
```

## Naming Conventions

### Variables and Functions
- Use `camelCase` for variables and functions
- Use descriptive names that indicate purpose

```typescript
const userProfile = getUserProfile();
const isAuthenticated = checkAuth();
```

### Classes and Interfaces
- Use `PascalCase` for classes, interfaces, and types
- Prefix interfaces with `I` only when it adds clarity

```typescript
class UserService {}
interface User {}
type RequestOptions = {};
```

### Constants
- Use `UPPER_SNAKE_CASE` for true constants
- Use `camelCase` for configuration objects

```typescript
const MAX_RETRY_COUNT = 3;
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000
};
```

### Files and Directories
- Use `kebab-case` for file names: `user-service.ts`
- Use `camelCase` for variable files: `userService.ts` (when exporting single entity)
- Test files: `user-service.test.ts` or `user-service.spec.ts`

## Import Organization

Organize imports in the following order:
1. Node.js built-in modules
2. External packages
3. Internal packages/modules
4. Relative imports

```typescript
// 1. Node.js built-in
import { readFile } from 'fs/promises';

// 2. External packages
import express from 'express';
import { z } from 'zod';

// 3. Internal packages
import { config } from '@/config';

// 4. Relative imports
import { User } from './types';
import { userService } from './user-service';
```

## Code Formatting

### ESLint
- Automatically enforced via pre-commit hooks
- Run `npm run lint:fix` to auto-fix issues

### Prettier
- Runs automatically on save (if configured in editor)
- Configuration in `.prettierrc`:
  - Single quotes: `true`
  - Trailing comma: `es5`
  - Tab width: `2`
  - Semi: `true`

### Line Length
- Maximum line length: 120 characters
- Break long lines logically

## Function Guidelines

### Function Length
- Keep functions short and focused (< 50 lines preferred)
- Extract complex logic into separate functions

### Parameters
- Maximum 3-4 parameters
- Use object parameters for multiple values

**Good:**
```typescript
function createUser({ name, email, role }: CreateUserParams) {
  // ...
}
```

**Bad:**
```typescript
function createUser(name: string, email: string, role: string, active: boolean) {
  // ...
}
```

### Return Values
- Be explicit about return types
- Return early to reduce nesting

```typescript
function getUser(id: string): User | null {
  if (!id) return null;
  
  const user = findUserById(id);
  if (!user) return null;
  
  return user;
}
```

## Error Handling

### Use Specific Errors
```typescript
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Async Error Handling
```typescript
try {
  const result = await fetchData();
  return result;
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation error
  }
  throw error;
}
```

## Comments and Documentation

### JSDoc Comments
Use JSDoc for public APIs:
```typescript
/**
 * Fetches user data from the database
 * @param userId - The unique user identifier
 * @returns User object or null if not found
 * @throws {DatabaseError} When database connection fails
 */
async function getUser(userId: string): Promise<User | null> {
  // ...
}
```

### Inline Comments
- !IMPORTANT: Use comments to explain "WHY" and "WHY NOT", not "WHAT"
- Avoid obvious comments
- Keep comments up-to-date with code

**Good:**
```typescript
// Retry with exponential backoff to handle rate limiting
const result = await retryWithBackoff(() => apiCall());
```

**Bad:**
```typescript
// Call API
const result = await apiCall();
```

## Best Practices

### Avoid Magic Numbers
```typescript
// Good
const MAX_RETRIES = 3;
if (retryCount > MAX_RETRIES) { }

// Bad
if (retryCount > 3) { }
```

### Use Const Assertions
```typescript
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'user' | 'guest'
```

### Destructuring
```typescript
// Prefer destructuring
const { name, email } = user;

// Over property access
const name = user.name;
const email = user.email;
```

### Optional Chaining
```typescript
// Use optional chaining
const city = user?.address?.city;

// Over nested if checks
const city = user && user.address && user.address.city;
```

## React/Frontend Specific

### Component Naming
- Use PascalCase: `UserProfile.tsx`
- One component per file (except small utility components)

### Hooks
- Custom hooks start with `use`: `useAuth`, `useUserData`
- Keep hooks focused and reusable

### Props
```typescript
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  // ...
};
```
