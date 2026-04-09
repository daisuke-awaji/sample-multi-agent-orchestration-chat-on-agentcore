/**
 * Formatters - Format violation results for test output
 */

import type { Violation, Cycle, PackageViolation } from './types';

/**
 * Format layer violations grouped by direction
 */
export function formatViolations(violations: Violation[]): string {
  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    const key = `${v.fromLayer}(L${v.fromLevel}) → ${v.toLayer}(L${v.toLevel})`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(v);
  }

  const lines: string[] = [];
  for (const [direction, vs] of grouped) {
    lines.push(`\n  ${direction} (${vs.length} violation${vs.length > 1 ? 's' : ''}):`);
    for (const v of vs) {
      lines.push(`    ${v.file}:${v.line}  import '${v.importSource}'`);
    }
  }
  return lines.join('\n');
}

/**
 * Format circular dependency cycles
 */
export function formatCycles(cycles: Cycle[]): string {
  const lines: string[] = [];
  for (const { cycle, edges } of cycles) {
    lines.push(`\n  ${cycle.join(' → ')}:`);
    for (const edge of edges) {
      for (const f of edge.files.slice(0, 3)) {
        lines.push(`    ${edge.from} → ${edge.to}: ${f.file}:${f.line}`);
      }
      if (edge.files.length > 3) {
        lines.push(`    ... and ${edge.files.length - 3} more`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Format package dependency violations
 */
export function formatPackageViolations(violations: PackageViolation[]): string {
  return violations.map((v) => `  ${v.package} → ${v.dependency} (not allowed)`).join('\n');
}
