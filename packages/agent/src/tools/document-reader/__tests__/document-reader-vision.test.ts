/**
 * Unit tests for document-reader vision features (with mocked Bedrock client)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_VISION_MODEL_ID,
  DEFAULT_VISION_PROMPT,
  DEFAULT_PPTX_VISION_PROMPT,
  MAX_VISION_SLIDES,
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

// ============================================================
// Mock setup
// ============================================================

// Mock request-context
jest.unstable_mockModule('../../../context/request-context.js', () => ({
  getCurrentContext: jest.fn(() => undefined),
  getCurrentStoragePath: jest.fn(() => '/'),
}));

// Mock Bedrock Runtime client (spread original to preserve all exports)
const originalBedrockRuntime = await import('@aws-sdk/client-bedrock-runtime');
const mockSend = jest.fn<(...args: any[]) => any>();
jest.unstable_mockModule('@aws-sdk/client-bedrock-runtime', () => ({
  ...originalBedrockRuntime,
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  ConverseCommand: jest.fn().mockImplementation((params: unknown) => params),
}));

// Dynamic import after mock setup
const { documentReaderTool } = await import('../tool.js');

/**
 * Helper to invoke the tool callback directly with vision params
 */
async function invokeTool(input: {
  filePath: string;
  maxLength?: number;
  enableVision?: boolean;
  visionModelId?: string;
  visionPrompt?: string;
}): Promise<string> {
  const toolAny = documentReaderTool as any;
  return toolAny._callback(input);
}

/**
 * Create a mock Bedrock Converse API response
 */
function createMockConverseResponse(text: string) {
  return {
    output: {
      message: {
        content: [{ text }],
      },
    },
  };
}

// ============================================================
// 1. Vision type constants
// ============================================================
describe('Vision type constants', () => {
  it('should define DEFAULT_VISION_MODEL_ID', () => {
    expect(DEFAULT_VISION_MODEL_ID).toBe('anthropic.claude-sonnet-4-5-20250929-v1:0');
  });

  it('should define DEFAULT_VISION_PROMPT', () => {
    expect(DEFAULT_VISION_PROMPT).toContain('analyze this document visually');
    expect(DEFAULT_VISION_PROMPT).toContain('tables');
    expect(DEFAULT_VISION_PROMPT).toContain('charts');
  });

  it('should define DEFAULT_PPTX_VISION_PROMPT', () => {
    expect(DEFAULT_PPTX_VISION_PROMPT).toContain('presentation slide');
    expect(DEFAULT_PPTX_VISION_PROMPT).toContain('tables');
  });

  it('should define MAX_VISION_SLIDES as 50', () => {
    expect(MAX_VISION_SLIDES).toBe(50);
  });
});

// ============================================================
// 2. PDF Vision Analysis (mocked Bedrock)
// ============================================================
describe('PDF Vision Analysis (mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
  });

  it('should include vision analysis section when enableVision=true for PDF', async () => {
    const mockDescription =
      'This PDF contains a title "Test PDF Document" with two pages of content.';
    mockSend.mockResolvedValueOnce(createMockConverseResponse(mockDescription));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
    });

    expect(result).toContain('Document read successfully (with Vision analysis)');
    expect(result).toContain('Vision Model:');
    expect(result).toContain('## Text Extraction');
    expect(result).toContain('## Vision Analysis');
    expect(result).toContain(mockDescription);
  });

  it('should not include vision analysis when enableVision=false (default)', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: false,
    });

    expect(result).toContain('Document read successfully');
    expect(result).not.toContain('Vision Analysis');
    expect(result).not.toContain('Vision Model:');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should not call Bedrock when enableVision is not provided', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
    });

    expect(result).toContain('Document read successfully');
    expect(result).not.toContain('Vision Analysis');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should use custom visionModelId when provided', async () => {
    const customModelId = 'anthropic.claude-3-haiku-20240307-v1:0';
    mockSend.mockResolvedValueOnce(createMockConverseResponse('Analysis result'));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
      visionModelId: customModelId,
    });

    expect(result).toContain(`Vision Model: ${customModelId}`);
  });

  it('should use custom visionPrompt when provided', async () => {
    const customPrompt = 'Extract only table data from this document';
    mockSend.mockResolvedValueOnce(createMockConverseResponse('Table data here'));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
      visionPrompt: customPrompt,
    });

    // Verify the mock was called and result contains expected content
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(result).toContain('Table data here');
  });

  it('should handle Bedrock API failure gracefully', async () => {
    mockSend.mockRejectedValueOnce(new Error('Throttling: Rate exceeded'));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
    });

    // Should still return text extraction results
    expect(result).toContain('Test PDF Document');
    // Vision section should show error
    expect(result).toContain('Vision analysis failed');
    expect(result).toContain('Rate exceeded');
  });

  it('should handle empty Bedrock response gracefully', async () => {
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [] } },
    });

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
    });

    expect(result).toContain('Vision analysis failed');
    expect(result).toContain('Empty response from model');
  });

  it('should not enable vision for DOCX format', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.docx'),
      enableVision: true,
    });

    expect(result).toContain('Document read successfully');
    expect(result).toContain('Vision analysis is only supported for PDF and PPTX');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should not enable vision for XLSX format', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.xlsx'),
      enableVision: true,
    });

    expect(result).toContain('Document read successfully');
    expect(result).toContain('Vision analysis is only supported for PDF and PPTX');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should include both text extraction and vision results for PDF', async () => {
    const visionText = 'The document has a header, two paragraphs, and a page number.';
    mockSend.mockResolvedValueOnce(createMockConverseResponse(visionText));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
    });

    // Text extraction section
    expect(result).toContain('## Text Extraction');
    expect(result).toContain('Test PDF Document');

    // Vision analysis section
    expect(result).toContain('## Vision Analysis');
    expect(result).toContain(visionText);
  });

  it('should show updated error guidance mentioning enableVision for corrupt PDF', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'corrupt.pdf'),
    });

    expect(result).toContain('enableVision=true');
  });
});

// ============================================================
// 3. PPTX Vision - basic behavior (no LibreOffice mock needed)
// ============================================================
describe('PPTX Vision basic behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
  });

  it('should not call Bedrock when enableVision=false for PPTX', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pptx'),
      enableVision: false,
    });

    expect(result).toContain('Document read successfully');
    expect(result).not.toContain('Vision Analysis');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should extract text normally when enableVision=false for PPTX', async () => {
    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pptx'),
    });

    expect(result).toContain('テストプレゼンテーション');
    expect(result).not.toContain('Vision Analysis');
  });
});

// ============================================================
// 4. Response format with vision
// ============================================================
describe('Response format with vision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
  });

  it('should include Vision Model in header when vision is enabled', async () => {
    mockSend.mockResolvedValueOnce(createMockConverseResponse('Analysis'));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
      visionModelId: 'test-model-id',
    });

    expect(result).toContain('Vision Model: test-model-id');
  });

  it('should use --- separators between text and vision sections', async () => {
    mockSend.mockResolvedValueOnce(createMockConverseResponse('Vision result here'));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
    });

    // Should have multiple --- separators
    const separatorCount = (result.match(/---/g) || []).length;
    expect(separatorCount).toBeGreaterThanOrEqual(2);
  });

  it('should show Extracted character count in header', async () => {
    mockSend.mockResolvedValueOnce(createMockConverseResponse('Vision analysis'));

    const result = await invokeTool({
      filePath: join(FIXTURES_DIR, 'test.pdf'),
      enableVision: true,
    });

    expect(result).toMatch(/Extracted: \d+ characters/);
  });
});
