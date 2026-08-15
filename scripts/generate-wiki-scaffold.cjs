#!/usr/bin/env node

/**
 * generate-wiki-scaffold.cjs
 * High-Performance Codebase Wiki Scaffolder:
 * Automatically inspects the current codebase, detects architecture, framework,
 * databases, monorepo packages, and generates a structured codebase wiki with initial boilerplate.
 * 
 * Usage:
 *   node generate-wiki-scaffold.cjs [--target <dir>] [--force]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Parse CLI Arguments
const args = process.argv.slice(2);
let targetDir = 'docs/wiki';
let force = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target' || args[i] === '-t') {
    targetDir = args[++i];
  } else if (args[i] === '--force' || args[i] === '-f') {
    force = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Codebase Wiki Scaffold Generator
Usage:
  node generate-wiki-scaffold.cjs [options]

Options:
  --target, -t <dir>   Destination directory for wiki (default: docs/wiki)
  --force, -f          Overwrite existing wiki files
  --help, -h           Show this help message
    `);
    process.exit(0);
  }
}

const rootDir = process.cwd();
const resolvedTarget = path.resolve(rootDir, targetDir);

console.log(`🔍 [1/4] Inspecting codebase at: ${rootDir}`);

// 1. Inspect package.json and workspace
let rootPkg = {};
try {
  rootPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
} catch (e) {
  // Not a node root or no package.json
}

const projectName = rootPkg.name || path.basename(rootDir);
const projectDesc = rootPkg.description || 'Enterprise Cloud & Web System';
const projectVersion = rootPkg.version || '1.0.0';

// Detect monorepo packages
const detectedApps = [];
const detectedPackages = [];

function scanSubdirs(dirName, targetList) {
  const fullPath = path.join(rootDir, dirName);
  if (fs.existsSync(fullPath)) {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const pkgJson = path.join(fullPath, ent.name, 'package.json');
        let name = ent.name;
        let desc = '';
        if (fs.existsSync(pkgJson)) {
          try {
            const p = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
            name = p.name || name;
            desc = p.description || '';
          } catch (_) {}
        }
        targetList.push({ name, dir: path.join(dirName, ent.name).replace(/\\/g, '/'), desc });
      }
    }
  }
}

scanSubdirs('apps', detectedApps);
scanSubdirs('packages', detectedPackages);
scanSubdirs('modules', detectedPackages);

// Detect Databases
const detectedDbs = [];
if (fs.existsSync(path.join(rootDir, 'docker-compose.yml')) || fs.existsSync(path.join(rootDir, 'docker-compose.yaml'))) {
  const dcPath = fs.existsSync(path.join(rootDir, 'docker-compose.yml')) ? 'docker-compose.yml' : 'docker-compose.yaml';
  const dc = fs.readFileSync(path.join(rootDir, dcPath), 'utf8');
  if (dc.includes('postgres')) detectedDbs.push('PostgreSQL');
  if (dc.includes('mysql') || dc.includes('mariadb')) detectedDbs.push('MySQL/MariaDB');
  if (dc.includes('redis')) detectedDbs.push('Redis');
  if (dc.includes('mongo')) detectedDbs.push('MongoDB');
}
if (fs.existsSync(path.join(rootDir, 'prisma'))) {
  detectedDbs.push('Prisma ORM');
}
if (detectedDbs.length === 0) {
  detectedDbs.push('Relational / Cloud Database');
}

console.log(`📦 [2/4] Discovered: Project=${projectName}, Apps=${detectedApps.length}, Packages=${detectedPackages.length}`);

// 2. Prepare templates
const templatesDir = path.resolve(__dirname, '../templates');
const nowIso = new Date().toISOString().split('T')[0];

const wikiFiles = [
  { fileName: '00-index.md', template: '00-index.template.md', title: 'Master Architecture & Table of Contents' },
  { fileName: '01-architecture-overview.md', template: '01-architecture-overview.template.md', title: 'System Architecture & C4 Topology' },
  { fileName: '02-domain-models-and-data.md', template: '02-domain-models-and-data.template.md', title: 'Domain Entities, Schemas & ERD' },
  { fileName: '03-api-and-contracts.md', template: '03-api-and-contracts.template.md', title: 'API Catalog & Interface Contracts' },
  { fileName: '04-features-and-workflows.md', template: '04-features-and-workflows.template.md', title: 'Core Business Features & Workflows' },
  { fileName: '05-infrastructure-and-devops.md', template: '05-infrastructure-and-devops.template.md', title: 'DevOps, CI/CD & Infrastructure' },
  { fileName: '06-developer-onboarding.md', template: '06-developer-onboarding.template.md', title: 'Developer Onboarding & Runbooks' },
  { fileName: '07-adrs-and-decisions.md', template: '07-adrs-and-decisions.template.md', title: 'Architecture Decision Records (ADRs)' }
];

function renderTemplate(content) {
  return content
    .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
    .replace(/\{\{PROJECT_DESCRIPTION\}\}/g, projectDesc)
    .replace(/\{\{PROJECT_VERSION\}\}/g, projectVersion)
    .replace(/\{\{GENERATION_DATE\}\}/g, nowIso)
    .replace(/\{\{PRIMARY_DATABASE\}\}/g, detectedDbs.join(', '));
}

// 3. Write wiki files
if (!fs.existsSync(resolvedTarget)) {
  fs.mkdirSync(resolvedTarget, { recursive: true });
}

console.log(`📝 [3/4] Writing Wiki documentation pages into: ${resolvedTarget}`);

let writtenCount = 0;
let skippedCount = 0;

for (const item of wikiFiles) {
  const destPath = path.join(resolvedTarget, item.fileName);
  const templatePath = path.join(templatesDir, item.template);

  if (fs.existsSync(destPath) && !force) {
    skippedCount++;
    continue;
  }

  let content = '';
  if (fs.existsSync(templatePath)) {
    content = renderTemplate(fs.readFileSync(templatePath, 'utf8'));
  } else {
    content = `# ${item.title}\n\nDocumentation for ${projectName}.\n\n*Generated on: ${nowIso}*\n`;
  }

  fs.writeFileSync(destPath, content, 'utf8');
  writtenCount++;
  console.log(`  + Created: ${item.fileName}`);
}

// 4. Generate wiki-config.json
const configPath = path.join(resolvedTarget, 'wiki-config.json');
if (!fs.existsSync(configPath) || force) {
  const defaultConfig = {
    wikiDir: targetDir.replace(/\\/g, '/'),
    title: `${projectName} Technical Wiki`,
    primaryWorkspace: {
      name: projectName,
      displayName: projectDesc || projectName,
      path: '.',
      routes: ['apps/api/src/routes', 'src/routes', 'src/api', 'routes', 'api'],
      schemas: ['packages/db/src/migrations', 'packages/db/src', 'prisma', 'src/db/migrations', 'src/db', 'migrations']
    },
    federatedWorkspaces: [],
    ragMemoryOutput: 'apps/api/data/wiki-rmemory-chunks.json'
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
  console.log(`  + Created: wiki-config.json`);
}

console.log(`\n🎉 [4/4] Wiki Scaffolding Complete!`);
console.log(`  Pages Created: ${writtenCount}, Skipped: ${skippedCount}`);
console.log(`  Config File  : ${configPath}`);
console.log(`\n💡 Run 'npx codebase-wiki-generator sync' to populate live API endpoints and database ERD!`);
