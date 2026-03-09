import { describe, it, expect } from '@jest/globals';
import { toDisplayPath } from '../display-path.js';
import { WORKSPACE_DIRECTORY } from '../../config/index.js';

describe('toDisplayPath', () => {
  it('should strip WORKSPACE_DIRECTORY prefix from path', () => {
    const filePath = `${WORKSPACE_DIRECTORY}/report.md`;
    expect(toDisplayPath(filePath)).toBe('/report.md');
  });

  it('should return path unchanged when not starting with WORKSPACE_DIRECTORY', () => {
    expect(toDisplayPath('/some/other/path/file.txt')).toBe('/some/other/path/file.txt');
  });

  it('should return "/" when path exactly equals WORKSPACE_DIRECTORY', () => {
    expect(toDisplayPath(WORKSPACE_DIRECTORY)).toBe('/');
  });

  it('should handle nested directory paths', () => {
    const filePath = `${WORKSPACE_DIRECTORY}/a/b/c/deep.txt`;
    expect(toDisplayPath(filePath)).toBe('/a/b/c/deep.txt');
  });

  it('should handle file directly under WORKSPACE_DIRECTORY', () => {
    const filePath = `${WORKSPACE_DIRECTORY}/notes.md`;
    expect(toDisplayPath(filePath)).toBe('/notes.md');
  });

  it('should not strip when path only partially matches WORKSPACE_DIRECTORY', () => {
    const filePath = '/completely/different/path';
    expect(toDisplayPath(filePath)).toBe('/completely/different/path');
  });
});
