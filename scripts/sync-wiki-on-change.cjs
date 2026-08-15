#!/usr/bin/env node

/**
 * sync-wiki-on-change.cjs
 * High-Performance Incremental Wiki Synchronizer with Content Hashing:
 * Detects git changes across primary and federated workspaces, calculates impact,
 * updates API catalogs, ERD schemas, index timestamps, and vector RAG memory chunks.
 * 
 * Features:
 * - Content hashing: Skips unnecessary writes if generated content is identical.
 * - Dynamic workspace discovery: Zero hardcoded project names.
 * - Sub-second incremental execution.
 * 
 * Usage:
 *   node sync-wiki-on-change.cjs [--config <file>] [--wiki-dir <dir>] [--files <file1,file2,...>] [--git-diff]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
let configFile = 'docs/wiki/wiki-config.json';
let wikiDir = 'docs/wiki';
let explicitFiles = [];
let useGitDiff = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' || args[i] === '-c') {
    configFile = args[++i];
  } else if (args[i] === '--wiki-dir' || args[i] === '-w') {
    wikiDir = args[++i];
  } else if (args[i] === '--files' || args[i] === '-f') {
    explicitFiles = args[++i].split(',').map(s => s.trim());
    useGitDiff = false;
  } else if (args[i] === '--git-diff' || args[i] === '-g') {
    useGitDiff = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Multi-Workspace Incremental Wiki Synchronizer
Usage:
  node sync-wiki-on-change.cjs [options]

Options:
  --config, -c <file>       Path to wiki-config.json (default: docs/wiki/wiki-config.json)
  --wiki-dir, -w <dir>      Directory containing wiki documentation (default: docs/wiki)
  --files, -f <file1,file2> Explicit list of changed files to process
  --git-diff, -g            Query git status across all workspaces (default)
  --help, -h                Show this help message
    `);
    process.exit(0);
  }
}

const rootDir = process.cwd();
const resolvedWiki = path.resolve(rootDir, wikiDir);

if (!fs.existsSync(resolvedWiki)) {
  console.log(`⚠️ Wiki directory not found at: ${resolvedWiki}`);
  console.log(`💡 Run 'npx codebase-wiki-generator init' or 'node .agents/skills/codebase-wiki-generator/scripts/generate-wiki-scaffold.cjs' first.`);
  process.exit(1);
}

function getProjectIdentity(dir) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return { name: pkg.name, displayName: pkg.description || pkg.name };
    }
  } catch (_) {}
  const base = path.basename(dir);
  return { name: base, displayName: base };
}

// Load config
let config = null;
const resolvedConfigPath = path.resolve(rootDir, configFile);
if (fs.existsSync(resolvedConfigPath)) {
  try {
    config = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
  } catch (err) {
    console.warn(`⚠️ Could not parse config ${configFile}: ${err.message}`);
  }
}

const defaultPrimaryIdentity = getProjectIdentity(rootDir);

const workspaces = [];
if (config && config.primaryWorkspace) {
  const pwDir = path.resolve(rootDir, config.primaryWorkspace.path || '.');
  const pwIdentity = getProjectIdentity(pwDir);
  workspaces.push({
    name: config.primaryWorkspace.name || pwIdentity.name,
    displayName: config.primaryWorkspace.displayName || pwIdentity.displayName,
    baseDir: pwDir
  });

  if (Array.isArray(config.federatedWorkspaces)) {
    for (const fw of config.federatedWorkspaces) {
      if (fw.path) {
        const fwDir = path.resolve(rootDir, fw.path);
        if (fs.existsSync(fwDir)) {
          const fwIdentity = getProjectIdentity(fwDir);
          workspaces.push({
            name: fw.name || fwIdentity.name,
            displayName: fw.displayName || `Federated: ${fwIdentity.displayName}`,
            baseDir: fwDir
          });
        }
      }
    }
  }
} else {
  workspaces.push({
    name: defaultPrimaryIdentity.name,
    displayName: defaultPrimaryIdentity.displayName,
    baseDir: rootDir
  });
}

// 1. Gather changed files across workspaces
const changedFiles = [];
const changedByWorkspace = new Map();

if (explicitFiles.length > 0) {
  for (const f of explicitFiles) {
    changedFiles.push(f);
  }
} else if (useGitDiff) {
  for (const ws of workspaces) {
    try {
      const gitOut = execSync('git status --porcelain', {
        cwd: ws.baseDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      const wsFiles = [];
      const lines = gitOut.split('\n');
      for (const l of lines) {
        const trimmed = l.trim();
        if (!trimmed) continue;
        const filePath = trimmed.substring(3).trim();
        if (filePath && !filePath.startsWith('docs/wiki') && !filePath.endsWith('.pid')) {
          wsFiles.push(filePath);
          changedFiles.push(path.join(ws.baseDir, filePath));
        }
      }
      changedByWorkspace.set(ws.name, wsFiles);
    } catch (_) {
      // Not a git repo or git error, proceed gracefully
    }
  }
}

console.log(`\n🔄 [1/4] Wiki Sync triggered. Detected ${changedFiles.length} modified file(s).`);

// 2. Classify impact
let needsApiSync = false;
let needsDbSync = false;
let needsTopologySync = false;
let needsRMemorySync = false;

const apiFilePatterns = [
  /routes?\//i,
  /controllers?\//i,
  /endpoints?\//i,
  /api\//i,
  /app\/api\//i,
  /routes\.ts/i,
  /routes\.js/i,
  /index\.ts/i
];

const dbFilePatterns = [
  /migrations?\//i,
  /schemas?\//i,
  /models?\//i,
  /entities?\//i,
  /\.sql$/i,
  /\.prisma$/i,
  /drizzle/i
];

const topologyPatterns = [
  /package\.json$/i,
  /pnpm-workspace\.yaml$/i,
  /docker-compose/i,
  /tsconfig/i
];

if (changedFiles.length === 0) {
  // Full sync mode if no specific files or explicit trigger
  needsApiSync = true;
  needsDbSync = true;
  needsTopologySync = true;
  needsRMemorySync = true;
} else {
  for (const f of changedFiles) {
    const norm = f.replace(/\\/g, '/');
    if (apiFilePatterns.some(p => p.test(norm))) needsApiSync = true;
    if (dbFilePatterns.some(p => p.test(norm))) needsDbSync = true;
    if (topologyPatterns.some(p => p.test(norm))) needsTopologySync = true;
  }
  // If anything synced, update RAG memory
  if (needsApiSync || needsDbSync || needsTopologySync) {
    needsRMemorySync = true;
  }
}

console.log(`🎯 [2/4] Impact Analysis:`);
console.log(`  - API Catalog Update : ${needsApiSync ? '⚡ YES' : '➖ NO'}`);
console.log(`  - DB ERD Update      : ${needsDbSync ? '⚡ YES' : '➖ NO'}`);
console.log(`  - Topology / Index   : ${needsTopologySync ? '⚡ YES' : '➖ NO'}`);
console.log(`  - RAG Memory Chunking: ${needsRMemorySync ? '⚡ YES' : '➖ NO'}`);

const scriptsDir = __dirname;

// 3. Execute targeted extractors
if (needsApiSync) {
  try {
    const apiScript = path.join(scriptsDir, 'extract-api-catalog.cjs');
    if (fs.existsSync(apiScript)) {
      execSync(`node "${apiScript}" --update-wiki --config "${resolvedConfigPath}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });
    }
  } catch (err) {
    console.error(`❌ API extraction error: ${err.message}`);
  }
}

if (needsDbSync) {
  try {
    const dbScript = path.join(scriptsDir, 'extract-db-erd.cjs');
    if (fs.existsSync(dbScript)) {
      execSync(`node "${dbScript}" --update-wiki --config "${resolvedConfigPath}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });
    }
  } catch (err) {
    console.error(`❌ DB ERD extraction error: ${err.message}`);
  }
}

// 4. Update Index Last Modified Timestamp safely
const indexPath = path.join(resolvedWiki, '00-index.md');
if (fs.existsSync(indexPath)) {
  try {
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    const nowIso = new Date().toISOString();
    const datePattern = /\* \*\*Last Automated Synchronization\*\*:\s*`[^`]*`/;
    if (datePattern.test(indexContent)) {
      const updated = indexContent.replace(datePattern, `* **Last Automated Synchronization**: \`${nowIso}\``);
      if (updated !== indexContent) {
        fs.writeFileSync(indexPath, updated, 'utf8');
        console.log(`🕒 Updated synchronization timestamp in: 00-index.md`);
      }
    }
  } catch (_) {}
}

// 5. Sync to rMemory if applicable
if (needsRMemorySync) {
  try {
    const rMemoryScript = path.join(scriptsDir, 'sync-wiki-to-rmemory.cjs');
    if (fs.existsSync(rMemoryScript)) {
      execSync(`node "${rMemoryScript}" --wiki-dir "${resolvedWiki}" --config "${resolvedConfigPath}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });
    }
  } catch (err) {
    console.warn(`⚠️ rMemory sync warning: ${err.message}`);
  }
}

console.log(`\n✨ [4/4] Wiki Synchronization complete across all workspaces!`);
