#!/usr/bin/env node

/**
 * install-skill.cjs
 * One-Command Installer for Codebase Wiki Generator & Auto-Sync Suite:
 * Installs the skill into target project (.agents/skills/codebase-wiki-generator)
 * or globally across Antigravity / AI Agent workspaces, and configures project scripts.
 * 
 * Usage:
 *   node install-skill.cjs [--target <dir>] [--global] [--no-scripts]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
let isGlobal = false;
let customTarget = null;
let injectScripts = true;
let autoScaffold = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--global' || args[i] === '-g') {
    isGlobal = true;
  } else if (args[i] === '--target' || args[i] === '-t') {
    customTarget = args[++i];
  } else if (args[i] === '--no-scripts') {
    injectScripts = false;
  } else if (args[i] === '--no-scaffold') {
    autoScaffold = false;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Codebase Wiki Skill Installer
Usage:
  node install-skill.cjs [options]

Options:
  --target, -t <dir>  Custom destination directory for skill files
  --global, -g        Install globally to ~/.gemini/antigravity/skills/codebase-wiki-generator
  --no-scripts        Do not modify target package.json scripts
  --no-scaffold       Do not prompt/auto-scaffold docs/wiki if missing
  --help, -h          Show this help message
    `);
    process.exit(0);
  }
}

const rootDir = process.cwd();
const sourceDir = path.resolve(__dirname, '..');

let targetSkillDir = '';
if (isGlobal) {
  const homeDir = os.homedir();
  targetSkillDir = path.join(homeDir, '.gemini', 'antigravity', 'skills', 'codebase-wiki-generator');
} else if (customTarget) {
  targetSkillDir = path.resolve(rootDir, customTarget);
} else {
  targetSkillDir = path.join(rootDir, '.agents', 'skills', 'codebase-wiki-generator');
}

console.log(`🚀 [1/3] Installing codebase-wiki-generator skill...`);
console.log(`  Source: ${sourceDir}`);
console.log(`  Destination: ${targetSkillDir}\n`);

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.wiki-watcher.pid') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  copyDirRecursive(sourceDir, targetSkillDir);
  console.log(`✅ [2/3] Successfully copied skill files to: ${targetSkillDir}`);
} catch (err) {
  console.error(`❌ Failed to copy skill files: ${err.message}`);
  process.exit(1);
}

// Check & inject package.json scripts if local install
if (!isGlobal && injectScripts) {
  const pkgJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (!pkg.scripts) pkg.scripts = {};

      const relSkillPath = path.relative(rootDir, targetSkillDir).replace(/\\/g, '/');

      const desiredScripts = {
        'wiki:scaffold': `node ${relSkillPath}/scripts/generate-wiki-scaffold.cjs`,
        'wiki:sync': `node ${relSkillPath}/scripts/sync-wiki-on-change.cjs`,
        'wiki:watch': `node ${relSkillPath}/scripts/watch-and-sync.cjs`,
        'wiki:stop': `node ${relSkillPath}/scripts/watch-and-sync.cjs --stop`,
        'wiki:validate': `node ${relSkillPath}/scripts/validate-wiki-links.cjs`
      };

      let modified = false;
      for (const [key, cmd] of Object.entries(desiredScripts)) {
        if (!pkg.scripts[key]) {
          pkg.scripts[key] = cmd;
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        console.log(`✅ [3/3] Injected shortcut scripts into package.json (wiki:scaffold, wiki:sync, wiki:watch, wiki:validate)`);
      } else {
        console.log(`ℹ️ [3/3] package.json scripts already present.`);
      }
    } catch (err) {
      console.warn(`⚠️ Could not update package.json: ${err.message}`);
    }
  }
}

console.log(`\n🎉 Installation Complete!`);
console.log(`💡 Next Steps:`);
console.log(`  1. Scaffold wiki: pnpm wiki:scaffold (or npm run wiki:scaffold)`);
console.log(`  2. Sync documentation: pnpm wiki:sync`);
console.log(`  3. Start live watcher: pnpm wiki:watch\n`);
