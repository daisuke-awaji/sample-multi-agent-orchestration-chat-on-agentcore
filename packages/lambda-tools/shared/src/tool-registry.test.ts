import { ToolRegistry } from './tool-registry';
import { Tool, ToolHandler } from './tool-types';

/**
 * Helper to create a mock Tool
 */
function createMockTool(name: string, overrides: Partial<Tool> = {}): Tool {
  return {
    name,
    handler: jest.fn(async () => ({ status: 'ok', tool: name })),
    description: `Mock ${name} tool`,
    version: '1.0.0',
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  let defaultTool: Tool;
  let toolA: Tool;
  let toolB: Tool;
  let registry: ToolRegistry;

  beforeEach(() => {
    defaultTool = createMockTool('default-tool');
    toolA = createMockTool('tool-a', { tags: ['query', 'read'] });
    toolB = createMockTool('tool-b', { tags: ['write'] });
    registry = new ToolRegistry([toolA, toolB], defaultTool);
  });

  describe('constructor', () => {
    it('should register all provided tools', () => {
      expect(registry.has('tool-a')).toBe(true);
      expect(registry.has('tool-b')).toBe(true);
    });

    it('should work with empty tools array', () => {
      const emptyRegistry = new ToolRegistry([], defaultTool);
      expect(emptyRegistry.getNames()).toEqual([]);
    });
  });

  describe('getHandler', () => {
    it('should return the correct handler for a registered tool', () => {
      const handler = registry.getHandler('tool-a');
      expect(handler).toBe(toolA.handler);
    });

    it('should return default handler when toolName is null', () => {
      const handler = registry.getHandler(null);
      expect(handler).toBe(defaultTool.handler);
    });

    it('should return default handler when tool is not found', () => {
      const handler = registry.getHandler('nonexistent');
      expect(handler).toBe(defaultTool.handler);
    });
  });

  describe('get', () => {
    it('should return the tool definition for a registered tool', () => {
      const tool = registry.get('tool-a');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('tool-a');
      expect(tool?.description).toBe('Mock tool-a tool');
    });

    it('should return undefined for an unregistered tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered tools', () => {
      expect(registry.has('tool-a')).toBe(true);
      expect(registry.has('tool-b')).toBe(true);
    });

    it('should return false for unregistered tools', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('getNames', () => {
    it('should return all registered tool names', () => {
      const names = registry.getNames();
      expect(names).toContain('tool-a');
      expect(names).toContain('tool-b');
      expect(names).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    it('should return all registered tool definitions', () => {
      const tools = registry.getAll();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['tool-a', 'tool-b']));
    });
  });

  describe('getByTag', () => {
    it('should return tools matching the specified tag', () => {
      const queryTools = registry.getByTag('query');
      expect(queryTools).toHaveLength(1);
      expect(queryTools[0].name).toBe('tool-a');
    });

    it('should return multiple tools when they share a tag', () => {
      const toolC = createMockTool('tool-c', { tags: ['query', 'admin'] });
      registry.register(toolC);

      const queryTools = registry.getByTag('query');
      expect(queryTools).toHaveLength(2);
    });

    it('should return empty array when no tools match the tag', () => {
      const result = registry.getByTag('nonexistent-tag');
      expect(result).toEqual([]);
    });

    it('should handle tools without tags', () => {
      const noTagTool = createMockTool('no-tag-tool', { tags: undefined });
      registry.register(noTagTool);

      const result = registry.getByTag('query');
      // no-tag-tool should not be included
      expect(result.find((t) => t.name === 'no-tag-tool')).toBeUndefined();
    });
  });

  describe('register', () => {
    it('should register a new tool dynamically', () => {
      const newTool = createMockTool('new-tool');
      registry.register(newTool);

      expect(registry.has('new-tool')).toBe(true);
      expect(registry.getHandler('new-tool')).toBe(newTool.handler);
    });

    it('should throw an error when registering a duplicate name', () => {
      const duplicate = createMockTool('tool-a');
      expect(() => registry.register(duplicate)).toThrow("Tool 'tool-a' is already registered");
    });
  });

  describe('unregister', () => {
    it('should remove a registered tool', () => {
      expect(registry.has('tool-a')).toBe(true);
      const result = registry.unregister('tool-a');
      expect(result).toBe(true);
      expect(registry.has('tool-a')).toBe(false);
    });

    it('should return false when unregistering a non-existent tool', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct registry statistics', () => {
      const stats = registry.getStats();

      expect(stats.totalTools).toBe(2);
      expect(stats.toolNames).toContain('tool-a');
      expect(stats.toolNames).toContain('tool-b');
      expect(stats.toolVersions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'tool-a', version: '1.0.0' }),
          expect.objectContaining({ name: 'tool-b', version: '1.0.0' }),
        ])
      );
      expect(stats.allTags).toEqual(expect.arrayContaining(['query', 'read', 'write']));
      expect(stats.defaultTool).toBe('default-tool');
    });

    it('should reflect changes after registration and unregistration', () => {
      registry.register(createMockTool('tool-c'));
      expect(registry.getStats().totalTools).toBe(3);

      registry.unregister('tool-c');
      expect(registry.getStats().totalTools).toBe(2);
    });
  });
});