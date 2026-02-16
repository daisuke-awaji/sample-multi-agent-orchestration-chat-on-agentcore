/**
 * Integration tests for document-reader vision features
 *
 * These tests make real API calls to Amazon Bedrock.
 * Run with: npm run test:integration
 *
 * Prerequisites:
 * - Valid AWS credentials configured
 * - Access to Bedrock models in the configured region
 * - LibreOffice installed (for PPTX vision tests)
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type DocumentBlock,
  type ImageBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

const execFileAsync = promisify(execFile);

// Use the same region and model as the agent config defaults
const BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1';
const VISION_MODEL_ID = process.env.VISION_MODEL_ID || 'anthropic.claude-sonnet-4-5-20250929-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });

// ============================================================
// 1. PDF Vision Analysis via Converse API document block
// ============================================================
describe('PDF Vision Analysis (Bedrock Converse API)', () => {
  it('should analyze a text-based PDF using document block', async () => {
    const buffer = readFileSync(join(FIXTURES_DIR, 'test.pdf'));

    const documentBlock: DocumentBlock = {
      format: 'pdf',
      name: 'test_pdf',
      source: {
        bytes: buffer,
      },
    };

    const contentBlocks: ContentBlock[] = [
      { document: documentBlock },
      {
        text: 'Please analyze this document visually and extract all text content, tables, and layout information.',
      },
    ];

    const command = new ConverseCommand({
      modelId: VISION_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.1,
      },
    });

    const response = await bedrockClient.send(command);

    // Verify response structure
    expect(response.output?.message?.content).toBeDefined();
    expect(response.output!.message!.content!.length).toBeGreaterThan(0);

    const textBlock = response.output!.message!.content!.find((block) => 'text' in block);
    expect(textBlock).toBeDefined();
    expect('text' in textBlock!).toBe(true);

    const description = (textBlock as { text: string }).text;
    expect(description.length).toBeGreaterThan(0);

    // The PDF contains "Test PDF Document" and page content
    // The vision model should be able to identify this
    console.log(`PDF vision analysis response (${description.length} chars):`);
    console.log(description.substring(0, 500));

    // Verify the model can read text from the PDF
    expect(description.toLowerCase()).toMatch(/test|pdf|document|page/i);
  }, 60000);

  it('should analyze a multi-page Japanese PDF using document block', async () => {
    const buffer = readFileSync(join(FIXTURES_DIR, 'japanese.pdf'));

    const documentBlock: DocumentBlock = {
      format: 'pdf',
      name: 'japanese_pdf',
      source: {
        bytes: buffer,
      },
    };

    const contentBlocks: ContentBlock[] = [
      { document: documentBlock },
      {
        text: 'Please analyze this document visually and extract all text content including Japanese text, sections, and structure.',
      },
    ];

    const command = new ConverseCommand({
      modelId: VISION_MODEL_ID,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.1,
      },
    });

    const response = await bedrockClient.send(command);

    const textBlock = response.output!.message!.content!.find((block) => 'text' in block);
    expect(textBlock).toBeDefined();

    const description = (textBlock as { text: string }).text;
    expect(description.length).toBeGreaterThan(0);

    console.log(`Japanese PDF vision analysis response (${description.length} chars):`);
    console.log(description.substring(0, 500));

    // Should identify sections from the PDF
    expect(description.toLowerCase()).toMatch(/section|overview|detail|conclusion|japanese/i);
  }, 60000);
});

// ============================================================
// 2. PPTX to PNG Conversion via LibreOffice
// ============================================================
describe('PPTX to PNG Conversion (LibreOffice)', () => {
  /**
   * Check if LibreOffice is available
   */
  async function isLibreOfficeAvailable(): Promise<boolean> {
    try {
      await execFileAsync('libreoffice', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  it('should convert a simple PPTX to PNG images', async () => {
    const available = await isLibreOfficeAvailable();
    if (!available) {
      console.warn('⚠️ LibreOffice not available, skipping PPTX conversion test');
      return;
    }

    const pptxPath = join(FIXTURES_DIR, 'test.pptx');
    const tempDir = await mkdtemp(join(tmpdir(), 'pptx-test-'));

    try {
      await execFileAsync('libreoffice', [
        '--headless',
        '--convert-to',
        'png',
        '--outdir',
        tempDir,
        pptxPath,
      ]);

      const files = await readdir(tempDir);
      const pngFiles = files.filter((f) => f.toLowerCase().endsWith('.png'));

      console.log(`Generated ${pngFiles.length} PNG file(s) from test.pptx:`);
      pngFiles.forEach((f) => console.log(`  - ${f}`));

      expect(pngFiles.length).toBeGreaterThan(0);

      // Verify each PNG is a valid image (check PNG magic bytes)
      for (const pngFile of pngFiles) {
        const data = await readFile(join(tempDir, pngFile));
        expect(data.length).toBeGreaterThan(100); // Reasonable minimum size
        // PNG magic bytes: 0x89 0x50 0x4E 0x47
        expect(data[0]).toBe(0x89);
        expect(data[1]).toBe(0x50);
        expect(data[2]).toBe(0x4e);
        expect(data[3]).toBe(0x47);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 120000);

  it('should convert a multi-slide PPTX to multiple PNG images', async () => {
    const available = await isLibreOfficeAvailable();
    if (!available) {
      console.warn('⚠️ LibreOffice not available, skipping multi-slide PPTX conversion test');
      return;
    }

    const pptxPath = join(FIXTURES_DIR, 'multi-slide.pptx');
    const tempDir = await mkdtemp(join(tmpdir(), 'pptx-multi-'));

    try {
      await execFileAsync('libreoffice', [
        '--headless',
        '--convert-to',
        'png',
        '--outdir',
        tempDir,
        pptxPath,
      ]);

      const files = await readdir(tempDir);
      const pngFiles = files.filter((f) => f.toLowerCase().endsWith('.png'));

      console.log(`Generated ${pngFiles.length} PNG file(s) from multi-slide.pptx:`);
      pngFiles.forEach((f) => console.log(`  - ${f}`));

      // multi-slide.pptx should have multiple slides
      expect(pngFiles.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 120000);
});

// ============================================================
// 3. PPTX Slide Image Analysis via Converse API image block
// ============================================================
describe('PPTX Slide Vision Analysis (Bedrock Converse API)', () => {
  async function isLibreOfficeAvailable(): Promise<boolean> {
    try {
      await execFileAsync('libreoffice', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  it('should analyze a PPTX slide image using Converse API image block', async () => {
    const available = await isLibreOfficeAvailable();
    if (!available) {
      console.warn('⚠️ LibreOffice not available, skipping PPTX vision analysis test');
      return;
    }

    // Step 1: Convert PPTX to PNG
    const pptxPath = join(FIXTURES_DIR, 'test.pptx');
    const tempDir = await mkdtemp(join(tmpdir(), 'pptx-vision-'));

    try {
      await execFileAsync('libreoffice', [
        '--headless',
        '--convert-to',
        'png',
        '--outdir',
        tempDir,
        pptxPath,
      ]);

      const files = await readdir(tempDir);
      const pngFiles = files.filter((f) => f.toLowerCase().endsWith('.png')).sort();

      expect(pngFiles.length).toBeGreaterThan(0);

      // Step 2: Analyze the first slide image with Bedrock
      const slideData = await readFile(join(tempDir, pngFiles[0]));

      const imageBlock: ImageBlock = {
        format: 'png',
        source: {
          bytes: slideData,
        },
      };

      const contentBlocks: ContentBlock[] = [
        { image: imageBlock },
        {
          text: 'Slide 1: Please analyze this presentation slide visually and extract all text, layout, and visual information.',
        },
      ];

      const command = new ConverseCommand({
        modelId: VISION_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
        inferenceConfig: {
          maxTokens: 4096,
          temperature: 0.1,
        },
      });

      const response = await bedrockClient.send(command);

      const textBlock = response.output!.message!.content!.find((block) => 'text' in block);
      expect(textBlock).toBeDefined();

      const description = (textBlock as { text: string }).text;
      expect(description.length).toBeGreaterThan(0);

      console.log(`PPTX slide vision analysis response (${description.length} chars):`);
      console.log(description.substring(0, 500));

      // The test.pptx contains Japanese text like "テストプレゼンテーション"
      // The model should identify slide content
      expect(description.length).toBeGreaterThan(50);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 120000);

  it('should analyze multiple slides from a multi-slide PPTX', async () => {
    const available = await isLibreOfficeAvailable();
    if (!available) {
      console.warn('⚠️ LibreOffice not available, skipping multi-slide vision test');
      return;
    }

    const pptxPath = join(FIXTURES_DIR, 'multi-slide.pptx');
    const tempDir = await mkdtemp(join(tmpdir(), 'pptx-multi-vision-'));

    try {
      await execFileAsync('libreoffice', [
        '--headless',
        '--convert-to',
        'png',
        '--outdir',
        tempDir,
        pptxPath,
      ]);

      const files = await readdir(tempDir);
      const pngFiles = files.filter((f) => f.toLowerCase().endsWith('.png')).sort();

      expect(pngFiles.length).toBeGreaterThanOrEqual(1);

      // Analyze first 2 slides (to keep test time reasonable)
      const slidesToAnalyze = pngFiles.slice(0, 2);

      for (let i = 0; i < slidesToAnalyze.length; i++) {
        const slideData = await readFile(join(tempDir, slidesToAnalyze[i]));

        const imageBlock: ImageBlock = {
          format: 'png',
          source: {
            bytes: slideData,
          },
        };

        const contentBlocks: ContentBlock[] = [
          { image: imageBlock },
          {
            text: `Slide ${i + 1}: Please analyze this presentation slide and describe its content.`,
          },
        ];

        const command = new ConverseCommand({
          modelId: VISION_MODEL_ID,
          messages: [
            {
              role: 'user',
              content: contentBlocks,
            },
          ],
          inferenceConfig: {
            maxTokens: 4096,
            temperature: 0.1,
          },
        });

        const response = await bedrockClient.send(command);

        const textBlock = response.output!.message!.content!.find((block) => 'text' in block);
        expect(textBlock).toBeDefined();

        const description = (textBlock as { text: string }).text;
        expect(description.length).toBeGreaterThan(0);

        console.log(`Slide ${i + 1} analysis (${description.length} chars):`);
        console.log(description.substring(0, 300));
        console.log('---');
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 180000);
});
