#!/usr/bin/env node

/**
 * extract-api-catalog.cjs
 * High-Performance Multi-Workspace API Catalog Extractor:
 * Parses backend API routes (Hono, Express, Fastify, Next.js, NestJS, Elysia, etc.)
 * across primary and federated workspaces, generating structured markdown API Catalog tables.
 * 
 * Usage:
 *   node extract-api-catalog.cjs [--config <file>] [--routes-dir <dir>] [--output <file>] [--update-wiki]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let configFile = 'docs/wiki/wiki-config.json';
let customRoutesDirs = null;
let outputFile = null;
let updateWiki = false;
let wikiPath = 'docs/wiki/03-api-and-contracts.md';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' || args[i] === '-c') {
    configFile = args[++i];
  } else if (args[i] === '--routes-dir' || args[i] === '-r') {
    customRoutesDirs = [args[++i]];
  } else if (args[i] === '--output' || args[i] === '-o') {
    outputFile = args[++i];
  } else if (args[i] === '--update-wiki' || args[i] === '-u') {
    updateWiki = true;
  } else if (args[i] === '--wiki-file' || args[i] === '-w') {
    wikiPath = args[++i];
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Multi-Workspace API Catalog Extractor
Usage:
  node extract-api-catalog.cjs [options]

Options:
  --config, -c <file>      Path to wiki-config.json (default: docs/wiki/wiki-config.json)
  --routes-dir, -r <dir>   Single directory containing route definitions
  --output, -o <file>      File path to write markdown table output
  --update-wiki, -u        Directly patch into docs/wiki/03-api-and-contracts.md
  --wiki-file, -w <file>   Custom path to 03-api-and-contracts.md
  --help, -h               Show this help message
    `);
    process.exit(0);
  }
}

const rootDir = process.cwd();

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

// Load wiki-config.json if available
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
    baseDir: pwDir,
    routes: config.primaryWorkspace.routes || [
      'apps/api/src/routes',
      'apps/api/src',
      'src/routes',
      'src/api',
      'routes',
      'api'
    ]
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
            baseDir: fwDir,
            routes: fw.routes || [
              'backend/src/routes',
              'src/routes',
              'routes',
              'api'
            ]
          });
        }
      }
    }
  }
} else {
  workspaces.push({
    name: defaultPrimaryIdentity.name,
    displayName: defaultPrimaryIdentity.displayName,
    baseDir: rootDir,
    routes: customRoutesDirs || [
      'apps/api/src/routes',
      'apps/api/src',
      'src/routes',
      'src/api',
      'app/api',
      'routes',
      'api',
      'server/routes'
    ]
  });
}

function scanFileForRoutes(filePath, relPath, workspaceBaseDir, workspaceName) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return [];
  }

  const lines = content.split('\n');
  const endpoints = [];
  const normalizedRelPath = relPath.replace(/\\/g, '/');

  // Route extraction patterns across popular Node / TS frameworks
  const patterns = [
    // Hono / Express: app.get('/path', ...), router.post('/path', ...), r.put('/path', ...)
    /(?:app|router|r|api|v1|v2|route|auth|assistant|webhook|admin)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    // Method chained: .get('/path', ...).post('/path', ...)
    /\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    // Next.js App Router: export async function GET(req), export function POST(
    /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/g,
    // NestJS: @Get('path'), @Post('path')
    /@(Get|Post|Put|Delete|Patch|Head|Options)\s*\(\s*['"`]?([^'"`]*)['"`]?\s*\)/gi
  ];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Pattern 1 & 2: Express / Hono / Fastify
    for (const pat of [patterns[0], patterns[1]]) {
      pat.lastIndex = 0;
      let match;
      while ((match = pat.exec(line)) !== null) {
        const method = match[1].toUpperCase();
        let routePath = match[2];

        // Clean up sub-route prefixes if relative
        if (!routePath.startsWith('/') && !routePath.startsWith('*')) {
          routePath = '/' + routePath;
        }

        // Infer auth & guards
        let authGuard = 'Public';
        const contextWindow = lines.slice(Math.max(0, lineIdx - 3), Math.min(lines.length, lineIdx + 5)).join(' ');
        if (/auth|jwt|requireAuth|bearer|adminOnly|superadmin|verifyToken|authenticate|authMiddleware/i.test(contextWindow)) {
          authGuard = 'Bearer JWT';
        } else if (/hmac|signature|webhookSecret/i.test(contextWindow)) {
          authGuard = 'HMAC SHA256';
        }

        // Infer description from nearby comments
        let description = '';
        if (lineIdx > 0 && lines[lineIdx - 1].trim().startsWith('//')) {
          description = lines[lineIdx - 1].replace(/^\/\/\s*/, '').trim();
        } else if (lineIdx > 0 && lines[lineIdx - 1].trim().startsWith('*')) {
          description = lines[lineIdx - 1].replace(/^\*\s*/, '').trim();
        }

        endpoints.push({
          method,
          path: routePath,
          fullPath: filePath,
          file: normalizedRelPath,
          line: lineIdx + 1,
          auth: authGuard,
          description: description || `Endpoint handler in ${path.basename(filePath)}`,
          workspace: workspaceName
        });
      }
    }

    // Pattern 3: Next.js App Router handler
    patterns[2].lastIndex = 0;
    let nextMatch;
    while ((nextMatch = patterns[2].exec(line)) !== null) {
      const method = nextMatch[1].toUpperCase();
      // Derive route path from file directory
      let routePath = '/' + normalizedRelPath
        .replace(/^(app|src\/app)\//, '')
        .replace(/\/route\.(ts|js|tsx|jsx)$/, '');

      endpoints.push({
        method,
        path: routePath,
        fullPath: filePath,
        file: normalizedRelPath,
        line: lineIdx + 1,
        auth: /auth|session|token|user/i.test(content) ? 'Session / JWT' : 'Public',
        description: `Next.js App Route handler`,
        workspace: workspaceName
      });
    }
  }

  return endpoints;
}

function walkDir(dir, baseDir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'build') {
      continue;
    }
    if (ent.isDirectory()) {
      walkDir(full, baseDir, fileList);
    } else if (/\.(ts|js|tsx|jsx|mjs|cjs)$/.test(ent.name) && !ent.name.endsWith('.d.ts')) {
      fileList.push({
        fullPath: full,
        relPath: path.relative(baseDir, full)
      });
    }
  }
  return fileList;
}

const allEndpoints = [];

for (const ws of workspaces) {
  console.log(`🔍 Scanning workspace: ${ws.displayName} (${ws.baseDir})`);
  let wsEndpointsCount = 0;

  for (const relRouteDir of ws.routes) {
    const targetDir = path.resolve(ws.baseDir, relRouteDir);
    if (fs.existsSync(targetDir)) {
      const files = walkDir(targetDir, ws.baseDir);
      for (const f of files) {
        const found = scanFileForRoutes(f.fullPath, f.relPath, ws.baseDir, ws.name);
        allEndpoints.push(...found);
        wsEndpointsCount += found.length;
      }
    }
  }
  console.log(`  -> Found ${wsEndpointsCount} endpoint(s) in ${ws.displayName}`);
}

// Deduplicate endpoints by workspace + method + path
const deduped = [];
const seen = new Set();

for (const ep of allEndpoints) {
  const key = `${ep.workspace}:${ep.method}:${ep.path}`;
  if (!seen.has(key)) {
    seen.add(key);
    deduped.push(ep);
  }
}

// Sort: Workspace -> Path -> Method
deduped.sort((a, b) => {
  if (a.workspace !== b.workspace) return a.workspace.localeCompare(b.workspace);
  if (a.path !== b.path) return a.path.localeCompare(b.path);
  return a.method.localeCompare(b.method);
});

console.log(`\n📊 Total Unique Endpoints Discovered: ${deduped.length}`);

const resolvedWikiPath = path.resolve(rootDir, wikiPath);
const wikiDirectory = path.dirname(resolvedWikiPath);

// Generate Markdown Table
let md = `## 📡 Automated API Route Catalog\n\n`;
md += `> Auto-generated by \`codebase-wiki-generator\` across ${workspaces.length} workspace(s). Total endpoints: **${deduped.length}**.\n\n`;

for (const ws of workspaces) {
  const wsEndpoints = deduped.filter(e => e.workspace === ws.name);
  md += `### Workspace: ${ws.displayName}\n\n`;
  md += `| Method | Endpoint Path | Auth Guard | Source File & Line | Description |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  if (wsEndpoints.length === 0) {
    md += `| _- | _No route definitions found_ | _- | _- | _- |\n\n`;
  } else {
    for (const ep of wsEndpoints) {
      const methodBadge = `\`${ep.method}\``;
      const relToWiki = path.relative(wikiDirectory, ep.fullPath).replace(/\\/g, '/');
      md += `| ${methodBadge} | \`${ep.path}\` | ${ep.auth} | [\`${ep.file}#L${ep.line}\`](${relToWiki}#L${ep.line}) | ${ep.description} |\n`;
    }
    md += `\n`;
  }
}

// Handle Output
if (outputFile) {
  const outPath = path.resolve(rootDir, outputFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`💾 Written catalog to: ${outPath}`);
}

if (updateWiki) {
  if (fs.existsSync(resolvedWikiPath)) {
    let wikiContent = fs.readFileSync(resolvedWikiPath, 'utf8');
    const startTag = '<!-- AUTO-GENERATED-API-CATALOG:START -->';
    const endTag = '<!-- AUTO-GENERATED-API-CATALOG:END -->';

    const newBlock = `${startTag}\n\n${md}\n${endTag}`;

    if (wikiContent.includes(startTag) && wikiContent.includes(endTag)) {
      wikiContent = wikiContent.replace(
        new RegExp(`${startTag}[\\s\\S]*?${endTag}`),
        newBlock
      );
    } else {
      wikiContent += `\n\n${newBlock}\n`;
    }

    fs.writeFileSync(resolvedWikiPath, wikiContent, 'utf8');
    console.log(`✅ Patched API catalog into: ${resolvedWikiPath}`);
  } else {
    console.warn(`⚠️ Target wiki file does not exist: ${resolvedWikiPath}`);
  }
}

if (!outputFile && !updateWiki) {
  console.log('\n' + md);
}
