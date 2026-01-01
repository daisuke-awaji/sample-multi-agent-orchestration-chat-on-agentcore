/**
 * Tests for SyncIgnorePattern
 */

import { SyncIgnorePattern } from '../sync-ignore-pattern.js';

describe('SyncIgnorePattern', () => {
  describe('default patterns', () => {
    it('should ignore .git directory', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('.git/config')).toBe(true);
      expect(pattern.shouldIgnore('.git/HEAD')).toBe(true);
      expect(pattern.shouldIgnore('path/to/.git/config')).toBe(true);
    });

    it('should ignore node_modules directory', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('node_modules/package.json')).toBe(true);
      expect(pattern.shouldIgnore('path/to/node_modules/index.js')).toBe(true);
    });

    it('should ignore .env files', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('.env')).toBe(true);
      expect(pattern.shouldIgnore('.env.local')).toBe(true);
      expect(pattern.shouldIgnore('.env.development.local')).toBe(true);
    });

    it('should not ignore .env.example (negated pattern)', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('.env.example')).toBe(false);
    });

    it('should ignore log files', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('app.log')).toBe(true);
      expect(pattern.shouldIgnore('debug.log')).toBe(true);
      expect(pattern.shouldIgnore('path/to/error.log')).toBe(true);
    });

    it('should ignore temporary files', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('file.tmp')).toBe(true);
      expect(pattern.shouldIgnore('data.temp')).toBe(true);
      expect(pattern.shouldIgnore('.DS_Store')).toBe(true);
    });

    it('should not ignore regular files', () => {
      const pattern = new SyncIgnorePattern();
      expect(pattern.shouldIgnore('README.md')).toBe(false);
      expect(pattern.shouldIgnore('src/index.ts')).toBe(false);
      expect(pattern.shouldIgnore('package.json')).toBe(false);
    });
  });

  describe('custom patterns', () => {
    it('should apply custom patterns', () => {
      const pattern = new SyncIgnorePattern(['*.pdf', 'data/']);
      expect(pattern.shouldIgnore('document.pdf')).toBe(true);
      expect(pattern.shouldIgnore('data/file.txt')).toBe(true);
      expect(pattern.shouldIgnore('README.md')).toBe(false);
    });

    it('should handle glob patterns', () => {
      const pattern = new SyncIgnorePattern(['**/*.test.js', 'coverage/']);
      expect(pattern.shouldIgnore('src/utils.test.js')).toBe(true);
      expect(pattern.shouldIgnore('deep/path/to/file.test.js')).toBe(true);
      expect(pattern.shouldIgnore('coverage/index.html')).toBe(true);
      expect(pattern.shouldIgnore('src/utils.js')).toBe(false);
    });

    it('should handle negation patterns', () => {
      const pattern = new SyncIgnorePattern(['*.log', '!important.log']);
      expect(pattern.shouldIgnore('debug.log')).toBe(true);
      expect(pattern.shouldIgnore('error.log')).toBe(true);
      expect(pattern.shouldIgnore('important.log')).toBe(false);
    });

    it('should ignore comments and empty lines', () => {
      const pattern = new SyncIgnorePattern([
        '# This is a comment',
        '',
        '*.log',
        '  ',
        'node_modules/',
      ]);
      expect(pattern.shouldIgnore('app.log')).toBe(true);
      expect(pattern.shouldIgnore('node_modules/pkg/index.js')).toBe(true);
    });
  });

  describe('fromSyncIgnoreContent', () => {
    it('should parse .syncignore file content', () => {
      const content = `# Custom syncignore file
*.pdf
node_modules/

# Exclude logs
*.log
!important.log
`;
      const pattern = SyncIgnorePattern.fromSyncIgnoreContent(content);

      expect(pattern.shouldIgnore('document.pdf')).toBe(true);
      expect(pattern.shouldIgnore('node_modules/pkg/index.js')).toBe(true);
      expect(pattern.shouldIgnore('app.log')).toBe(true);
      expect(pattern.shouldIgnore('important.log')).toBe(false);
      expect(pattern.shouldIgnore('README.md')).toBe(false);
    });

    it('should handle Windows line endings', () => {
      const content = '*.tmp\r\n*.log\r\n';
      const pattern = SyncIgnorePattern.fromSyncIgnoreContent(content);

      expect(pattern.shouldIgnore('file.tmp')).toBe(true);
      expect(pattern.shouldIgnore('app.log')).toBe(true);
    });
  });

  describe('filter', () => {
    it('should filter array of file paths', () => {
      const pattern = new SyncIgnorePattern(['*.log', 'node_modules/']);
      const files = [
        'README.md',
        'app.log',
        'node_modules/pkg/index.js',
        'src/index.ts',
        'debug.log',
      ];

      const filtered = pattern.filter(files);

      expect(filtered).toEqual(['README.md', 'src/index.ts']);
    });
  });

  describe('getPatterns', () => {
    it('should return current patterns', () => {
      const pattern = new SyncIgnorePattern(['*.pdf', '!important.pdf']);
      const patterns = pattern.getPatterns();

      expect(patterns.ignore).toContain('*.pdf');
      expect(patterns.negate).toContain('important.pdf');
    });
  });

  describe('Windows path handling', () => {
    it('should handle Windows backslash paths', () => {
      const pattern = new SyncIgnorePattern(['node_modules/']);
      expect(pattern.shouldIgnore('node_modules\\pkg\\index.js')).toBe(true);
    });
  });

  describe('directory patterns', () => {
    it('should match directory patterns correctly', () => {
      const pattern = new SyncIgnorePattern(['build/', 'dist/']);
      expect(pattern.shouldIgnore('build/index.html')).toBe(true);
      expect(pattern.shouldIgnore('dist/bundle.js')).toBe(true);
      expect(pattern.shouldIgnore('src/build.ts')).toBe(false);
    });
  });

  describe('complex patterns', () => {
    it('should handle multiple glob patterns', () => {
      const pattern = new SyncIgnorePattern([
        '**/*.test.ts',
        '**/__tests__/**',
        'coverage/**',
      ]);

      expect(pattern.shouldIgnore('src/utils.test.ts')).toBe(true);
      expect(pattern.shouldIgnore('src/__tests__/utils.spec.ts')).toBe(true);
      expect(pattern.shouldIgnore('coverage/lcov-report/index.html')).toBe(true);
      expect(pattern.shouldIgnore('src/utils.ts')).toBe(false);
    });
  });
});
