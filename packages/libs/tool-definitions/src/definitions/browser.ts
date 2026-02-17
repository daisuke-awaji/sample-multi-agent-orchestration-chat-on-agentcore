import { z } from 'zod';
import { zodToJsonSchema } from '../utils/schema-converter.js';
import type { ToolDefinition } from '../types.js';

const browserSchema = z.object({
  // Action type (required)
  action: z
    .enum([
      'startSession',
      'navigate',
      'click',
      'type',
      'screenshot',
      'getContent',
      'scroll',
      'back',
      'forward',
      'waitForElement',
      'stopSession',
      'getSessionStatus',
    ])
    .describe(
      'The browser operation to perform. Must be one of: startSession (initialize browser), navigate (go to URL), click (click element), type (enter text), screenshot (capture page), getContent (extract text), scroll (scroll page), back/forward (browser navigation), waitForElement (wait for element), stopSession (end session), getSessionStatus (check session)'
    ),

  // Session name (for multi-session management)
  sessionName: z
    .string()
    .optional()
    .describe(
      'Session name for the browser environment. If not specified, a default session is used. Use startSession first to create a session, then specify that session name for subsequent operations.'
    ),

  // For startSession
  viewportWidth: z
    .number()
    .optional()
    .default(1280)
    .describe('Browser viewport width in pixels (for startSession, default: 1280)'),
  viewportHeight: z
    .number()
    .optional()
    .default(720)
    .describe('Browser viewport height in pixels (for startSession, default: 720)'),

  // For navigate
  url: z
    .string()
    .optional()
    .describe('URL to navigate to (REQUIRED for navigate action)'),

  // For click / type / waitForElement
  selector: z
    .string()
    .optional()
    .describe(
      'CSS selector or text description of the element to interact with (REQUIRED for click, type, waitForElement actions)'
    ),

  // For type
  text: z
    .string()
    .optional()
    .describe('Text to type into the selected element (REQUIRED for type action)'),

  // For scroll
  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe('Scroll direction (for scroll action, default: down)'),
  amount: z
    .number()
    .optional()
    .describe('Scroll amount in pixels (for scroll action, default: 500)'),

  // For waitForElement
  timeoutMs: z
    .number()
    .optional()
    .default(10000)
    .describe('Timeout in milliseconds for waitForElement (default: 10000)'),
});

export const browserDefinition: ToolDefinition<typeof browserSchema> = {
  name: 'browser',
  description: `AgentCore Browser tool for interacting with web applications through a managed Chrome browser.

This tool provides a secure, cloud-based browser environment that enables:
- Navigating to websites and web applications
- Clicking buttons, links, and interactive elements
- Filling out forms and typing text
- Taking screenshots of web pages (saved to user's S3 storage)
- Extracting text content from pages
- Scrolling through long pages

## Usage Workflow:
1. Start with 'startSession' to initialize the browser (or it will auto-start on first action)
2. Use 'navigate' to visit a URL
3. Interact with the page using 'click', 'type', 'scroll'
4. Use 'screenshot' to capture the current visual state
5. Use 'getContent' to extract text from the page
6. End with 'stopSession' when finished to free resources

## Important Notes:
- Sessions auto-timeout after 15 minutes of inactivity
- Always use 'stopSession' when finished to free resources
- Use CSS selectors for element selection (e.g., "button.submit", "#search-input", "a[href='/about']")
- Screenshots are automatically saved to the user's S3 storage
- The browser runs in a secure, isolated cloud environment`,
  zodSchema: browserSchema,
  jsonSchema: zodToJsonSchema(browserSchema),
};
