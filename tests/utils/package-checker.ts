/**
 * Package Checker - Checks package.json dependency violations
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PackageRule, PackageViolation } from './types';

/**
 * Check that packages only depend on allowed @moca/* packages
 */
export function checkPackageDependencies(
  rules: PackageRule[],
  repoRoot: string
): PackageViolation[] {
  const violations: PackageViolation[] = [];

  for (const rule of rules) {
    const pkgDir =
      rule.name === 'frontend'
        ? 'packages/frontend'
        : `packages/${rule.name.replace('@moca/', '')}`;

    let pkgJsonPath = path.join(repoRoot, pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      pkgJsonPath = path.join(
        repoRoot,
        'packages',
        'libs',
        rule.name.replace('@moca/', ''),
        'package.json'
      );
    }
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

    for (const dep of Object.keys(allDeps)) {
      if (dep.startsWith('@moca/') && !rule.allowedDeps.includes(dep)) {
        violations.push({ package: rule.name, dependency: dep });
      }
    }
  }

  return violations;
}
