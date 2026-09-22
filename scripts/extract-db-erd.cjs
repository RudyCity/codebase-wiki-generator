#!/usr/bin/env node

/**
 * extract-db-erd.cjs
 * High-Performance Multi-Workspace Database Schema & ERD Extractor:
 * Parses database schemas, migrations (SQL, Prisma, Drizzle, TypeORM) across primary
 * and federated workspaces, generating unified Mermaid erDiagrams and Markdown catalogs.
 * 
 * Usage:
 *   node extract-db-erd.cjs [--config <file>] [--db-dir <dir>] [--update-wiki] [--wiki-file <file>]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let configFile = 'docs/wiki/wiki-config.json';
let customDbDirs = null;
let updateWiki = false;
let isModular = false;
let wikiPath = 'docs/wiki/02-domain-models-and-data.md';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' || args[i] === '-c') {
    configFile = args[++i];
  } else if (args[i] === '--db-dir' || args[i] === '-d') {
    customDbDirs = [args[++i]];
  } else if (args[i] === '--update-wiki' || args[i] === '-u') {
    updateWiki = true;
  } else if (args[i] === '--modular' || args[i] === '-m') {
    isModular = true;
  } else if (args[i] === '--wiki-file' || args[i] === '-w') {
    wikiPath = args[++i];
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Multi-Workspace Database ERD & Schema Extractor
Usage:
  node extract-db-erd.cjs [options]

Options:
  --config, -c <file>     Path to wiki-config.json (default: docs/wiki/wiki-config.json)
  --db-dir, -d <dir>      Directory containing database definitions/migrations
  --modular, -m           Generate modular schema files in schemas/ (anti-monolith mode)
  --update-wiki, -u       Directly patch into docs/wiki/02-domain-models-and-data.md
  --wiki-file, -w <file>  Custom path to 02-domain-models-and-data.md
  --help, -h              Show this help message
    `);
    process.exit(0);
  }
}

const rootDir = process.cwd();
const tables = new Map();
const relationships = [];

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
    if (config.modular) isModular = true;
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
    schemas: config.primaryWorkspace.schemas || [
      'packages/db/src/migrations',
      'packages/db/src',
      'prisma',
      'src/db/migrations',
      'src/db',
      'src/entities',
      'migrations',
      'db/migrations'
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
            schemas: fw.schemas || [
              'backend/src/db/migrations',
              'backend/src/db',
              'src/db/migrations',
              'src/db',
              'prisma',
              'migrations'
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
    schemas: customDbDirs || [
      'packages/db/src/migrations',
      'packages/db/src',
      'prisma',
      'src/db/migrations',
      'src/db',
      'src/entities',
      'migrations',
      'db/migrations',
      'backend/src/db'
    ]
  });
}

function parseSqlCreateTable(content, workspacePrefix) {
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?[\w_]+[`"']?)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    let rawTableName = match[1].replace(/[`"']/g, '');
    let body = match[2];

    const fields = [];
    const lines = body.split('\n');

    for (let line of lines) {
      line = line.trim().replace(/,$/, '');
      if (!line || line.startsWith('--') || line.startsWith('/*')) continue;

      // Check foreign key constraint
      const fkMatch = line.match(/(?:CONSTRAINT\s+[`"']?[\w_]+[`"']?\s+)?FOREIGN\s+KEY\s*\(([`"']?[\w_]+[`"']?)\)\s*REFERENCES\s+([`"']?[\w_]+[`"']?)\s*\(([`"']?[\w_]+[`"']?)\)/i);
      if (fkMatch) {
        const fromCol = fkMatch[1].replace(/[`"']/g, '');
        const toTable = fkMatch[2].replace(/[`"']/g, '');
        const toCol = fkMatch[3].replace(/[`"']/g, '');
        relationships.push({
          from: rawTableName,
          to: toTable,
          type: '}o--||',
          label: `${fromCol} -> ${toCol}`
        });
        continue;
      }

      // Check primary key constraint line
      if (/^PRIMARY\s+KEY/i.test(line)) continue;
      if (/^UNIQUE\s*\(/i.test(line)) continue;
      if (/^INDEX\s+/i.test(line)) continue;

      const colMatch = line.match(/^([`"']?[\w_]+[`"']?)\s+([A-Za-z0-9_()]+)(.*)$/);
      if (colMatch) {
        const colName = colMatch[1].replace(/[`"']/g, '');
        const colType = colMatch[2].toLowerCase().replace(/\(.*\)/, '');
        const rest = colMatch[3] || '';

        const isPk = /PRIMARY\s+KEY/i.test(rest);
        const isFk = /REFERENCES\s+([`"']?[\w_]+[`"']?)/i.test(rest);

        if (isFk) {
          const refTableMatch = rest.match(/REFERENCES\s+([`"']?[\w_]+[`"']?)/i);
          if (refTableMatch) {
            relationships.push({
              from: rawTableName,
              to: refTableMatch[1].replace(/[`"']/g, ''),
              type: '}o--||',
              label: colName
            });
          }
        }

        fields.push({
          name: colName,
          type: colType || 'string',
          isPk,
          isFk
        });
      }
    }

    if (!tables.has(rawTableName)) {
      tables.set(rawTableName, {
        name: rawTableName,
        workspace: workspacePrefix,
        fields
      });
    }
  }
}

function parsePrismaSchema(content, workspacePrefix) {
  const modelRegex = /model\s+([\w_]+)\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    const body = match[2];
    const fields = [];

    const lines = body.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const colName = parts[0];
        const colType = parts[1];
        const isPk = line.includes('@id');
        const isFk = line.includes('@relation');

        fields.push({
          name: colName,
          type: colType.toLowerCase(),
          isPk,
          isFk
        });
      }
    }

    if (!tables.has(modelName)) {
      tables.set(modelName, {
        name: modelName,
        workspace: workspacePrefix,
        fields
      });
    }
  }
}

function parseTsSchema(content, workspacePrefix) {
  // Drizzle ORM: pgTable, sqliteTable, mysqlTable
  const drizzleRegex = /(?:export\s+const\s+)?([\w_]+)\s*=\s*(?:pgTable|sqliteTable|mysqlTable)\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  let match;
  while ((match = drizzleRegex.exec(content)) !== null) {
    const tableName = match[2];
    const body = match[3];
    const fields = [];
    const colRegex = /([\w_]+)\s*:\s*([a-zA-Z0-9_]+)\s*\(/g;
    let colMatch;
    while ((colMatch = colRegex.exec(body)) !== null) {
      const colName = colMatch[1];
      const colType = colMatch[2].toLowerCase();
      const isPk = colName === 'id' || body.includes(`${colName}.primaryKey()`);
      const isFk = colName.endsWith('_id') || colName.endsWith('Id') || body.includes(`.references(`);
      fields.push({
        name: colName,
        type: colType,
        isPk,
        isFk
      });
    }

    if (!tables.has(tableName)) {
      tables.set(tableName, {
        name: tableName,
        workspace: workspacePrefix,
        fields
      });
    }
  }

  // Relations in Drizzle
  const relRegex = /export\s+const\s+([\w_]+)\s*=\s*relations\s*\(\s*([\w_]+)\s*,\s*\(\s*\{\s*(one|many)\s*\}\s*\)\s*=>\s*\(\{([\s\S]*?)\}\)\s*\)/g;
  let relMatch;
  while ((relMatch = relRegex.exec(content)) !== null) {
    const sourceTable = relMatch[2];
    const relBody = relMatch[4];
    const relFieldRegex = /([\w_]+)\s*:\s*(one|many)\s*\(\s*([\w_]+)/g;
    let fieldMatch;
    while ((fieldMatch = relFieldRegex.exec(relBody)) !== null) {
      const targetTable = fieldMatch[3];
      const cardinality = fieldMatch[2] === 'many' ? '}o--||' : '||--||';
      relationships.push({
        from: sourceTable,
        to: targetTable,
        type: cardinality,
        label: fieldMatch[1]
      });
    }
  }

  parseSqlCreateTable(content, workspacePrefix);
}

function scanDir(targetPath, wsName) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (targetPath.endsWith('.sql')) {
      const content = fs.readFileSync(targetPath, 'utf8');
      parseSqlCreateTable(content, wsName);
    } else if (targetPath.endsWith('.prisma')) {
      const content = fs.readFileSync(targetPath, 'utf8');
      parsePrismaSchema(content, wsName);
    } else if (targetPath.endsWith('.ts') || targetPath.endsWith('.js')) {
      const content = fs.readFileSync(targetPath, 'utf8');
      parseTsSchema(content, wsName);
    }
    return;
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });

  for (const ent of entries) {
    const full = path.join(targetPath, ent.name);
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;

    if (ent.isDirectory()) {
      scanDir(full, wsName);
    } else if (ent.name.endsWith('.sql')) {
      const content = fs.readFileSync(full, 'utf8');
      parseSqlCreateTable(content, wsName);
    } else if (ent.name === 'schema.prisma' || ent.name.endsWith('.prisma')) {
      const content = fs.readFileSync(full, 'utf8');
      parsePrismaSchema(content, wsName);
    } else if (ent.name.endsWith('.ts') || ent.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      parseTsSchema(content, wsName);
    }
  }
}

for (const ws of workspaces) {
  for (const schemaRel of ws.schemas) {
    const schemaDir = path.resolve(ws.baseDir, schemaRel);
    if (fs.existsSync(schemaDir)) {
      scanDir(schemaDir, ws.name);
    }
  }
}

console.log(`📊 Discovered ${tables.size} entity table(s) across ${workspaces.length} workspace(s).`);

// Generate Mermaid erDiagram
let mermaid = `\`\`\`mermaid\nerDiagram\n`;

for (const [tName, tData] of tables.entries()) {
  mermaid += `    ${tName} {\n`;
  const displayFields = isModular
    ? tData.fields.filter(f => f.isPk || f.isFk).slice(0, 8)
    : tData.fields.slice(0, 15);

  if (displayFields.length === 0 && tData.fields.length > 0) {
    displayFields.push(tData.fields[0]);
  }

  for (const f of displayFields) {
    const attr = f.isPk ? 'PK' : f.isFk ? 'FK' : '';
    mermaid += `        ${f.type} ${f.name} ${attr}\n`;
  }
  if (tData.fields.length > displayFields.length) {
    mermaid += `        more_fields ...\n`;
  }
  mermaid += `    }\n`;
}

// Deduplicate relationships
const relSeen = new Set();
for (const rel of relationships) {
  const key = `${rel.from}->${rel.to}:${rel.label}`;
  if (!relSeen.has(key) && tables.has(rel.from) && tables.has(rel.to)) {
    relSeen.add(key);
    mermaid += `    ${rel.from} ${rel.type} ${rel.to} : "${rel.label}"\n`;
  }
}

mermaid += `\`\`\`\n`;

// Handle Modular Schema File Generation
const resolvedWikiPath = path.resolve(rootDir, wikiPath);
const wikiDirectory = path.dirname(resolvedWikiPath);

if (isModular && updateWiki) {
  const schemasDir = path.join(wikiDirectory, 'schemas');
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

  for (const [tName, tData] of tables.entries()) {
    const tableFileName = `${tName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}.md`;
    const tableFilePath = path.join(schemasDir, tableFileName);

    let tableMd = `# Entity Schema: \`${tName}\`\n\n`;
    tableMd += `- **Workspace**: \`${tData.workspace}\`\n`;
    tableMd += `- **Total Columns**: ${tData.fields.length}\n`;
    tableMd += `- **Parent Document**: [02-domain-models-and-data.md](../${path.basename(resolvedWikiPath)})\n\n`;
    tableMd += `## Columns Specification\n\n`;
    tableMd += `| Column Name | Data Type | Key Constraint | Attributes |\n`;
    tableMd += `| :--- | :--- | :--- | :--- |\n`;

    for (const f of tData.fields) {
      const keyStr = f.isPk ? '`PK` (Primary Key)' : f.isFk ? '`FK` (Foreign Key)' : '-';
      tableMd += `| **\`${f.name}\`** | \`${f.type}\` | ${keyStr} | - |\n`;
    }

    const relatedRels = relationships.filter(r => r.from === tName || r.to === tName);
    if (relatedRels.length > 0) {
      tableMd += `\n## Entity Relationships\n\n`;
      tableMd += `| Source Entity | Relationship | Target Entity | Label |\n`;
      tableMd += `| :--- | :--- | :--- | :--- |\n`;
      for (const r of relatedRels) {
        tableMd += `| \`${r.from}\` | \`${r.type}\` | \`${r.to}\` | ${r.label} |\n`;
      }
    }

    fs.writeFileSync(tableFilePath, tableMd, 'utf8');
  }
  console.log(`📑 Generated ${tables.size} modular schema specification file(s) in: ${schemasDir}`);
}

// Generate Markdown Table Catalog
let catalogMd = `### 📋 Entity Catalog Table\n\n`;
if (isModular) {
  catalogMd += `| Table / Entity | Workspace | Columns Count | Key Primary & Foreign Fields | Detailed Schema Spec |\n`;
  catalogMd += `| :--- | :--- | :--- | :--- | :--- |\n`;
} else {
  catalogMd += `| Table / Entity | Workspace | Columns Count | Key Primary & Foreign Fields |\n`;
  catalogMd += `| :--- | :--- | :--- | :--- |\n`;
}

for (const [tName, tData] of tables.entries()) {
  const pkFields = tData.fields.filter(f => f.isPk).map(f => `\`${f.name}\` (PK)`).join(', ');
  const fkFields = tData.fields.filter(f => f.isFk).map(f => `\`${f.name}\` (FK)`).join(', ');
  const keys = [pkFields, fkFields].filter(Boolean).join('; ') || '_none_';
  if (isModular) {
    const tableFileName = `${tName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}.md`;
    catalogMd += `| **\`${tName}\`** | \`${tData.workspace}\` | ${tData.fields.length} | ${keys} | [📄 View Schema](./schemas/${tableFileName}) |\n`;
  } else {
    catalogMd += `| **\`${tName}\`** | \`${tData.workspace}\` | ${tData.fields.length} | ${keys} |\n`;
  }
}

const fullOutput = `## 🗄️ Domain Entity Relationship Diagrams (ERD)\n\n${mermaid}\n\n${catalogMd}`;

if (updateWiki) {
  if (fs.existsSync(resolvedWikiPath)) {
    let wikiContent = fs.readFileSync(resolvedWikiPath, 'utf8');
    const startTag = '<!-- AUTO-GENERATED-ERD:START -->';
    const endTag = '<!-- AUTO-GENERATED-ERD:END -->';

    const newBlock = `${startTag}\n\n${fullOutput}\n\n${endTag}`;

    if (wikiContent.includes(startTag) && wikiContent.includes(endTag)) {
      wikiContent = wikiContent.replace(
        new RegExp(`${startTag}[\\s\\S]*?${endTag}`),
        newBlock
      );
    } else {
      wikiContent += `\n\n${newBlock}\n`;
    }

    fs.writeFileSync(resolvedWikiPath, wikiContent, 'utf8');
    console.log(`✅ Patched ERD diagrams into: ${resolvedWikiPath}`);
  }
} else {
  console.log('\n' + fullOutput);
}
