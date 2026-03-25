---
name: testing
description: Testing guidelines and best practices for Moca
---

# Testing Guide

This document outlines testing practices, conventions, and guidelines for the Moca project.

## Local development

!IMPORTANT RULE: You **SHOULD NOT RUN** the command **npm run dev** unless your user specifically tells you to, which is usually because they are running npm run dev and have hot-reload enabled.

## Test Structure

### Unit Tests
Located in `__tests__/` directory or alongside source files with `.test.ts` suffix.

```
packages/<package>/src/
├── services/
│   ├── user-service.ts
│   └── user-service.test.ts
└── __tests__/
    └── integration/
```

### Integration Tests
Located in `tests/` directory with `.integration.test.ts` suffix.

```
packages/<package>/src/tests/
├── s3-upload.integration.test.ts
├── cognito-auth.integration.test.ts
└── setup.ts
```

## Naming Conventions

### Test Files
- Unit tests: `<feature>.test.ts` or `<feature>.spec.ts`
- Integration tests: `<feature>.integration.test.ts`
- E2E tests: `<feature>.e2e.test.ts`

### Test Descriptions
```typescript
describe('UserService', () => {
  describe('getUser', () => {
    it('should return user when valid ID is provided', () => {
      // ...
    });
    
    it('should return null when user does not exist', () => {
      // ...
    });
    
    it('should throw ValidationError when ID is invalid', () => {
      // ...
    });
  });
});
```

## Testing Patterns

### AAA Pattern (Arrange-Act-Assert)
```typescript
it('should calculate total price correctly', () => {
  // Arrange
  const items = [
    { price: 100, quantity: 2 },
    { price: 50, quantity: 1 }
  ];
  
  // Act
  const total = calculateTotal(items);
  
  // Assert
  expect(total).toBe(250);
});
```

### Test Data Builders
```typescript
// test-helpers.ts
export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    ...overrides
  };
}

// Usage
it('should update user name', () => {
  const user = createMockUser({ name: 'John' });
  // ...
});
```

## Mocking

### Mock Functions
```typescript
const mockFetch = jest.fn();
mockFetch.mockResolvedValue({ data: 'test' });

// Verify calls
expect(mockFetch).toHaveBeenCalledWith('https://api.example.com');
expect(mockFetch).toHaveBeenCalledTimes(1);
```

### Mock Modules
```typescript
jest.mock('./user-service', () => ({
  getUserById: jest.fn().mockResolvedValue({ id: '123', name: 'Test' })
}));
```

### Spy on Methods
```typescript
const spy = jest.spyOn(userService, 'getUser');
spy.mockResolvedValue({ id: '123', name: 'Test' });

// Restore original implementation
spy.mockRestore();
```

## Async Testing

### Promises
```typescript
it('should fetch user data', async () => {
  const user = await getUserById('123');
  expect(user.name).toBe('Test User');
});
```

### Error Handling
```typescript
it('should throw error when API fails', async () => {
  await expect(fetchData()).rejects.toThrow('Network error');
});
```

### Timeout Configuration
```typescript
it('should complete within time limit', async () => {
  // ... test code
}, 10000); // 10 second timeout
```

## Integration Testing

### Setup and Teardown
```typescript
// setup.ts
beforeAll(async () => {
  // Initialize test database, S3, etc.
  await setupTestEnvironment();
});

afterAll(async () => {
  // Cleanup
  await cleanupTestEnvironment();
});

beforeEach(() => {
  // Reset state before each test
  jest.clearAllMocks();
});
```

### AWS Integration Tests
```typescript
describe('S3 Upload Integration', () => {
  it('should upload file to S3', async () => {
    const result = await uploadFile({
      bucket: TEST_BUCKET,
      key: 'test-file.txt',
      body: 'test content'
    });
    
    expect(result.success).toBe(true);
    expect(result.key).toBe('test-file.txt');
  });
});
```

## Test Coverage

### Running Coverage
```bash
npm test -- --coverage
```

### Coverage Thresholds
Configure in `jest.config.js`:
```javascript
module.exports = {
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### What to Cover
- **High Priority**: Business logic, data transformations, error handling
- **Medium Priority**: Utilities, helpers, validators
- **Low Priority**: Simple getters/setters, configuration files

## Best Practices

### 1. Test Behavior, Not Implementation
```typescript
// Good: Tests behavior
it('should return formatted user name', () => {
  const result = formatUserName({ firstName: 'John', lastName: 'Doe' });
  expect(result).toBe('John Doe');
});

// Bad: Tests implementation details
it('should call trim() method', () => {
  const spy = jest.spyOn(String.prototype, 'trim');
  formatUserName({ firstName: 'John', lastName: 'Doe' });
  expect(spy).toHaveBeenCalled();
});
```

### 2. Keep Tests Isolated
```typescript
// Each test should be independent
describe('Counter', () => {
  let counter: Counter;
  
  beforeEach(() => {
    counter = new Counter(); // Fresh instance for each test
  });
  
  it('should start at 0', () => {
    expect(counter.value).toBe(0);
  });
  
  it('should increment by 1', () => {
    counter.increment();
    expect(counter.value).toBe(1);
  });
});
```

### 3. Use Descriptive Test Names
```typescript
// Good
it('should return 400 when email is invalid', () => {});

// Bad
it('works', () => {});
```

### 4. Avoid Logic in Tests
```typescript
// Good
it('should handle multiple items', () => {
  const items = [1, 2, 3];
  const result = sum(items);
  expect(result).toBe(6);
});

// Bad: Contains logic (loop)
it('should handle multiple items', () => {
  const items = [1, 2, 3];
  let expected = 0;
  for (const item of items) {
    expected += item;
  }
  const result = sum(items);
  expect(result).toBe(expected);
});
```

### 5. Test Edge Cases
```typescript
describe('divide', () => {
  it('should divide positive numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });
  
  it('should handle negative numbers', () => {
    expect(divide(-10, 2)).toBe(-5);
  });
  
  it('should throw when dividing by zero', () => {
    expect(() => divide(10, 0)).toThrow('Division by zero');
  });
  
  it('should handle decimal results', () => {
    expect(divide(7, 2)).toBe(3.5);
  });
});
```

## Jest Configuration

### Basic Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ]
};
```

### TypeScript Support
```javascript
module.exports = {
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

## Running Tests

### All Tests
```bash
npm test
```

### Specific Package
```bash
npm test --workspace=@moca/agent
```

### Watch Mode
```bash
npm test -- --watch
```

### Integration Tests Only
```bash
npm run test:integration
```

### With Coverage
```bash
npm test -- --coverage
```

## Continuous Integration

Tests are automatically run in CI/CD pipeline:
- On every commit
- Before deployment
- With coverage reporting

Configuration in `.gitlab-ci.yml`:
```yaml
test:
  script:
    - npm ci
    - npm test -- --coverage
```

## Debugging Tests

### VS Code Configuration
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal"
}
```

### Debugging Individual Test
```typescript
it.only('should debug this test', () => {
  // Add breakpoint here
  const result = myFunction();
  expect(result).toBe(expected);
});
```

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [Test-Driven Development Best Practices](https://testingjavascript.com/)
