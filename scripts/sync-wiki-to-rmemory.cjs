#!/usr/bin/env node

/**
 * sync-wiki-to-rmemory.cjs
 * Vector RAG Knowledge Memory Syncer:
 * Parses all generated wiki markdown documents, splits them into semantic chunks,
 * and synchronizes them with the RMemory vector knowledge base for AI Customer Agents & Store Copilots.
 * 
 * Usage:
 *   node sync-wiki-to-rmemory.cjs [--wiki-dir <dir>] [--output-json <file>] [--config <file>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
let configFile = 'docs/wiki/wiki-config.json';
let wikiDir = 'docs/wiki';
let outputJson = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' || args[i] === '-c') {
    configFile = args[++i];
  } else if (args[i] === '--wiki-dir' || args[i] === '-w') {
    wikiDir = args[++i];
  } else if (args[i] === '--output-json' || args[i] === '-o') {
    outputJson = args[++i];
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Vector RAG Memory Syncer for Codebase Wiki
Usage:
  node sync-wiki-to-rmemory.cjs [options]

Options:
  --config, -c <file>        Path to wiki-config.json (default: docs/wiki/wiki-config.json)
  --wiki-dir, -w <dir>       Directory containing wiki markdown files (default: docs/wiki)
  --output-json, -o <file>   Destination JSON file for memory chunks
  --help, -h                 Show this help message
    `);
    process.exit(0);
  }
}

const rootDir = process.cwd();

// Load config
let config = null;
const resolvedConfigPath = path.resolve(rootDir, configFile);
if (fs.existsSync(resolvedConfigPath)) {
  try {
    config = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
    if (config.wikiDir && !args.includes('--wiki-dir') && !args.includes('-w')) {
      wikiDir = config.wikiDir;
    }
    if (!outputJson && config.ragMemoryOutput) {
      outputJson = config.ragMemoryOutput;
    }
  } catch (err) {
    console.warn(`⚠️ Could not parse config ${configFile}: ${err.message}`);
  }
}

if (!outputJson) {
  outputJson = 'apps/api/data/wiki-rmemory-chunks.json';
}

const resolvedWiki = path.resolve(rootDir, wikiDir);

if (!fs.existsSync(resolvedWiki)) {
  console.error(`❌ Wiki directory not found at: ${resolvedWiki}`);
  process.exit(1);
}

console.log(`🧠 [1/3] Chunking Wiki documentation for Vector RAG search...`);

const mdFiles = fs.readdirSync(resolvedWiki).filter(f => f.endsWith('.md'));
const memoryChunks = [];

for (const file of mdFiles) {
  const fullPath = path.join(resolvedWiki, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  let currentSectionTitle = path.basename(file, '.md');
  let currentChunkLines = [];

  for (const line of lines) {
    if (line.match(/^#{1,3}\s+(.+)$/)) {
      if (currentChunkLines.length > 0) {
        const text = currentChunkLines.join('\n').trim();
        if (text.length > 50) {
          const chunkId = crypto.createHash('sha256').update(`${file}:${currentSectionTitle}:${text.slice(0, 100)}`).digest('hex').slice(0, 16);
          memoryChunks.push({
            id: `wiki-${chunkId}`,
            document: file,
            section: currentSectionTitle,
            content: text,
            updatedAt: new Date().toISOString()
          });
        }
        currentChunkLines = [];
      }
      currentSectionTitle = line.replace(/^#{1,3}\s+/, '').trim();
    } else {
      currentChunkLines.push(line);
    }
  }

  // Last chunk
  if (currentChunkLines.length > 0) {
    const text = currentChunkLines.join('\n').trim();
    if (text.length > 50) {
      const chunkId = crypto.createHash('sha256').update(`${file}:${currentSectionTitle}:${text.slice(0, 100)}`).digest('hex').slice(0, 16);
      memoryChunks.push({
        id: `wiki-${chunkId}`,
        document: file,
        section: currentSectionTitle,
        content: text,
        updatedAt: new Date().toISOString()
      });
    }
  }
}

console.log(`✅ [2/3] Generated ${memoryChunks.length} semantic RAG chunks from ${mdFiles.length} wiki files.`);

const resolvedOutput = path.resolve(rootDir, outputJson);
fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });

const payload = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  totalChunks: memoryChunks.length,
  chunks: memoryChunks
};

fs.writeFileSync(resolvedOutput, JSON.stringify(payload, null, 2), 'utf8');
console.log(`💾 [3/3] Successfully saved RAG chunks to: ${resolvedOutput}`);
