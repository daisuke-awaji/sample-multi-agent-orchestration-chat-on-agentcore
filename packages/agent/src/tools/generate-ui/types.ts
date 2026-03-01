/**
 * Type definitions for the generate_ui tool
 *
 * Shared types (UISpec, UIElement, UISpecOutput, isUISpec, isUISpecOutput) are
 * re-exported from @moca/generative-ui-catalog to keep a single source of truth.
 */

import { COMPONENT_NAMES } from '@moca/generative-ui-catalog';

// Re-export shared types and type guards
export type { UIElement, UISpec, UISpecOutput } from '@moca/generative-ui-catalog';
export { isUISpec, isUISpecOutput } from '@moca/generative-ui-catalog';

/**
 * Supported component types in the UI catalog — derived from the shared catalog (SSoT).
 */
export const UI_COMPONENT_TYPES = COMPONENT_NAMES;
