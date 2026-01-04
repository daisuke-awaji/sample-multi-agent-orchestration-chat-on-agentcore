/**
 * Tests for SyncIgnoreFilter
 */

import { SyncIgnoreFilter } from '../sync-ignore-filter.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SyncIgnoreFilter', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-ignore-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('default patterns', () => {
    it('should ignore system files', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('.DS_Store')).toBe(true);
      expect(filter.isIgnored('Thumbs.db')).toBe(true);
      expect(filter.isIgnored('file.swp')).toBe(true);
      expect(filter.isIgnored('backup~')).toBe(true);
    });

    it('should ignore build artifacts', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('node_modules/package/index.js')).toBe(true);
      expect(filter.isIgnored('__pycache__/module.pyc')).toBe(true);
      expect(filter.isIgnored('test.pyc')).toBe(true);
      expect(filter.isIgnored('build/output.jar')).toBe(true);
      expect(filter.isIgnored('dist/bundle.js')).toBe(true);
      expect(filter.isIgnored('target/classes/Main.class')).toBe(true);
    });

    it('should ignore IDE settings', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('.idea/workspace.xml')).toBe(true);
      expect(filter.isIgnored('.vscode/settings.json')).toBe(true);
      expect(filter.isIgnored('project.iml')).toBe(true);
    });

    it('should ignore log files', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('error.log')).toBe(true);
      expect(filter.isIgnored('logs/app.log')).toBe(true);
    });

    it('should ignore temporary files', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('temp.tmp')).toBe(true);
      expect(filter.isIgnored('file.temp')).toBe(true);
      expect(filter.isIgnored('.cache/data')).toBe(true);
    });

    it('should ignore .syncignore file itself', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('.syncignore')).toBe(true);
    });

    it('should not ignore regular files', () => {
      const filter = new SyncIgnoreFilter();

      expect(filter.isIgnored('README.md')).toBe(false);
      expect(filter.isIgnored('src/index.ts')).toBe(false);
      expect(filter.isIgnored('package.json')).toBe(false);
      expect(filter.isIgnored('docs/guide.pdf')).toBe(false);
    });
  });

  describe('custom patterns from .syncignore', () => {
    it('should load custom patterns from .syncignore file', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(
        syncignorePath,
        `# Custom patterns
secrets/
*.key
*.pem
test-data/
`
      );

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      expect(filter.isIgnored('secrets/api-key.txt')).toBe(true);
      expect(filter.isIgnored('private.key')).toBe(true);
      expect(filter.isIgnored('cert.pem')).toBe(true);
      expect(filter.isIgnored('test-data/sample.json')).toBe(true);
    });

    it('should handle empty lines and comments', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(
        syncignorePath,
        `# This is a comment

# Another comment
*.secret

# Empty lines should be ignored
`
      );

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      expect(filter.isIgnored('password.secret')).toBe(true);
      expect(filter.isIgnored('# This is a comment')).toBe(false);
    });

    it('should work without .syncignore file', () => {
      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      // Should still apply default patterns
      expect(filter.isIgnored('node_modules/package')).toBe(true);
      expect(filter.isIgnored('README.md')).toBe(false);
    });

    it('should combine default and custom patterns', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(syncignorePath, '*.custom\n');

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      // Default pattern
      expect(filter.isIgnored('node_modules/pkg')).toBe(true);
      // Custom pattern
      expect(filter.isIgnored('file.custom')).toBe(true);
      // Not ignored
      expect(filter.isIgnored('file.txt')).toBe(false);
    });
  });

  describe('pattern matching', () => {
    it('should handle wildcard patterns', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(
        syncignorePath,
        `*.backup
temp*
*-old.*
`
      );

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      expect(filter.isIgnored('file.backup')).toBe(true);
      expect(filter.isIgnored('tempfile.txt')).toBe(true);
      expect(filter.isIgnored('data-old.json')).toBe(true);
    });

    it('should handle directory patterns', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(
        syncignorePath,
        `coverage/
.git/
private/
`
      );

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      expect(filter.isIgnored('coverage/lcov-report/index.html')).toBe(true);
      expect(filter.isIgnored('.git/config')).toBe(true);
      expect(filter.isIgnored('private/secrets.txt')).toBe(true);
    });

    it('should handle negation patterns', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(
        syncignorePath,
        `*.log
!important.log
`
      );

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      expect(filter.isIgnored('error.log')).toBe(true);
      expect(filter.isIgnored('important.log')).toBe(false);
    });

    it('should normalize path separators', () => {
      const filter = new SyncIgnoreFilter();

      // Should work with both forward and backslashes
      expect(filter.isIgnored('node_modules/package')).toBe(true);
      expect(filter.isIgnored('node_modules\\package')).toBe(true);
    });
  });

  describe('filter method', () => {
    it('should filter array of paths', () => {
      const filter = new SyncIgnoreFilter();

      const paths = [
        'README.md',
        'node_modules/pkg/index.js',
        'src/index.ts',
        '.DS_Store',
        'dist/bundle.js',
        'package.json',
      ];

      const filtered = filter.filter(paths);

      expect(filtered).toEqual(['README.md', 'src/index.ts', 'package.json']);
    });

    it('should return empty array when all paths are ignored', () => {
      const filter = new SyncIgnoreFilter();

      const paths = ['node_modules/pkg', '.DS_Store', 'build/output'];

      const filtered = filter.filter(paths);

      expect(filtered).toEqual([]);
    });

    it('should return all paths when none are ignored', () => {
      const filter = new SyncIgnoreFilter();

      const paths = ['README.md', 'src/index.ts', 'package.json'];

      const filtered = filter.filter(paths);

      expect(filtered).toEqual(paths);
    });
  });

  describe('getInfo', () => {
    it('should return pattern information', () => {
      const filter = new SyncIgnoreFilter();

      const info = filter.getInfo();

      expect(info.defaultPatternsCount).toBeGreaterThan(0);
      expect(info.customPatternsLoaded).toBe(false);
    });

    it('should indicate when custom patterns are loaded', () => {
      const syncignorePath = path.join(tempDir, '.syncignore');
      fs.writeFileSync(syncignorePath, '*.custom\n');

      const filter = new SyncIgnoreFilter();
      filter.loadFromWorkspace(tempDir);

      const info = filter.getInfo();

      expect(info.customPatternsLoaded).toBe(true);
    });
  });
});
