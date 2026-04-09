/**
 * Architecture Test Types
 */

export interface LayerRule {
  name: string;
  layers: Record<string, number>;
  srcRoot: string;
  layerExtractor: (filepath: string) => string | null;
}

export interface PackageRule {
  name: string;
  allowedDeps: string[];
}

export interface Violation {
  file: string;
  importSource: string;
  fromLayer: string;
  fromLevel: number;
  toLayer: string;
  toLevel: number;
  line: number;
}

export interface PackageViolation {
  package: string;
  dependency: string;
}

export interface LayerEdge {
  from: string;
  to: string;
  files: Array<{ file: string; line: number }>;
}

export interface Cycle {
  cycle: string[];
  edges: LayerEdge[];
}

export interface ImportInfo {
  source: string;
  line: number;
}
