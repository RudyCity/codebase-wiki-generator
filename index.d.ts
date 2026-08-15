/**
 * @rudycity/codebase-wiki-generator TypeScript Definitions
 */

export interface WikiOptions {
  cwd?: string;
  silent?: boolean;
  env?: Record<string, string>;
}

export interface ScaffoldOptions extends WikiOptions {
  target?: string;
  force?: boolean;
}

export interface SyncOptions extends WikiOptions {
  config?: string;
  wikiDir?: string;
  files?: string[];
}

export interface ApiCatalogOptions extends WikiOptions {
  config?: string;
  updateWiki?: boolean;
  output?: string;
}

export interface DbErdOptions extends WikiOptions {
  config?: string;
  updateWiki?: boolean;
}

export interface ValidationOptions extends WikiOptions {
  wikiDir?: string;
}

export interface RMemoryOptions extends WikiOptions {
  config?: string;
  wikiDir?: string;
  output?: string;
}

export function scaffoldWiki(options?: ScaffoldOptions): string;
export function syncWiki(options?: SyncOptions): string;
export function extractApiCatalog(options?: ApiCatalogOptions): string;
export function extractDbErd(options?: DbErdOptions): string;
export function validateLinks(options?: ValidationOptions): string;
export function validateFreshness(options?: ValidationOptions): string;
export function syncRMemory(options?: RMemoryOptions): string;
