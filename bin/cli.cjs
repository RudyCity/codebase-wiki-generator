#!/usr/bin/env node

/**
 * @rudycity/codebase-wiki-generator
 * Unified Master CLI Entrypoint
 * 
 * Usage:
 *   npx codebase-wiki-generator <command> [options]
 *   wiki <command> [options]
 */

const path = require('path');
const { spawn } = require('child_process');

const scriptsDir = path.resolve(__dirname, '../scripts');

const COMMANDS = {
  'scaffold': { script: 'generate-wiki-scaffold.cjs', desc: 'Scaffold full 8-pillar codebase wiki structure' },
  'init': { script: 'generate-wiki-scaffold.cjs', desc: 'Alias for scaffold' },
  'sync': { script: 'sync-wiki-on-change.cjs', desc: 'Perform incremental or full wiki sync (API, ERD, RAG)' },
  'watch': { script: 'watch-and-sync.cjs', desc: 'Start real-time watcher daemon with auto-sync' },
  'stop': { script: 'watch-and-sync.cjs', desc: 'Stop active real-time watcher daemon', defaultArgs: ['--stop'] },
  'status': { script: 'watch-and-sync.cjs', desc: 'Check status of running wiki watcher daemon', defaultArgs: ['--status'] },
  'validate': { script: 'validate-wiki-links.cjs', desc: 'Validate internal markdown links and anchor integrity' },
  'freshness': { script: 'validate-wiki-freshness.cjs', desc: 'Check documentation freshness against git history' },
  'extract-api': { script: 'extract-api-catalog.cjs', desc: 'Extract API routes catalog into markdown table' },
  'extract-erd': { script: 'extract-db-erd.cjs', desc: 'Extract database schemas into Mermaid erDiagram' },
  'rmemory': { script: 'sync-wiki-to-rmemory.cjs', desc: 'Generate semantic RAG memory chunks for AI agents' },
  'install-skill': { script: 'install-skill.cjs', desc: 'Install this skill suite into target project or global agent store' },
  'setup-hooks': { script: 'setup-git-hooks.cjs', desc: 'Configure Git pre-commit and post-merge hooks for wiki sync' }
};

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
📚 Codebase Wiki Generator & Auto-Sync Suite CLI
Usage:
  npx codebase-wiki-generator <command> [options]

Available Commands:
${Object.entries(COMMANDS)
  .filter(([k]) => k !== 'init')
  .map(([k, v]) => `  ${k.padEnd(16)} ${v.desc}`)
  .join('\n')}

General Options:
  --help, -h       Show help information
  --version, -v    Show version number

Examples:
  npx codebase-wiki-generator init
  npx codebase-wiki-generator sync
  npx codebase-wiki-generator watch
  npx codebase-wiki-generator validate
  npx codebase-wiki-generator install-skill
`);
}

if (!command || command === '--help' || command === '-h' || command === 'help') {
  printHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v' || command === 'version') {
  const pkg = require('../package.json');
  console.log(`codebase-wiki-generator v${pkg.version}`);
  process.exit(0);
}

const targetConfig = COMMANDS[command];
if (!targetConfig) {
  console.error(`❌ Unknown command: '${command}'`);
  printHelp();
  process.exit(1);
}

const scriptPath = path.join(scriptsDir, targetConfig.script);
const forwardedArgs = [...(targetConfig.defaultArgs || []), ...args.slice(1)];

const child = spawn(process.execPath, [scriptPath, ...forwardedArgs], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env
});

child.on('close', (code) => {
  process.exit(code || 0);
});
