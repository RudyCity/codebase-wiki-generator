# Codebase Wiki Generator & Auto-Sync Suite 📚

> **Multi-dimensional codebase wiki generation, C4 architecture diagrams, ERD extraction, API cataloging, and automatic real-time synchronization suite for Single Repositories and Federated Multi-Workspace projects.**

Compatible as an **AI Agent Skill** (Antigravity, Claude Code, Cursor, Codex) or as a **Standalone CLI Toolchain** with zero external runtime dependencies (pure Node.js).

---

## 🚀 Key Features

* **Complete Architecture Wiki Scaffolding**: Automatically creates structured 8-pillar wiki documentation (`00-index.md` to `07-adrs-and-decisions.md`).
* **Automated API Cataloging**: Scans routes (`Hono`, `Express`, `Fastify`, `Next.js App Router`, `NestJS`, `Elysia`, `Koa`) and generates complete endpoint tables with method, path, source line, and auth guards.
* **Automated ERD & Schema Extraction**: Scans SQL migrations (`CREATE TABLE`, `FOREIGN KEY`), `Prisma`, `Drizzle`, or `TypeORM` schemas and outputs Mermaid Entity Relationship Diagrams.
* **Smart Singleton Watcher Daemon**: Watches file changes across primary and federated workspaces and automatically synchronizes the wiki in real-time with duplicate PID auto-kill.
* **Semantic RAG Memory Sync**: Auto-chunks wiki pages into vector/JSON embeddings for AI assistants and customer agents (`rMemory`).
* **Wiki Link & Freshness Auditing**: Scans broken internal links, anchors, and flags outdated pages against recent Git commit hashes.
* **Unified Master CLI**: Run any task via `npx codebase-wiki-generator <cmd>` or standard npm scripts.
* **Zero NPM Runtime Dependencies**: Built entirely with native Node.js standard modules (`fs`, `path`, `crypto`, `child_process`).

---

## 📦 One-Command Installation

### In Any Target Project
To install this skill suite into your current repository and auto-configure `package.json` scripts:

```bash
# Clone directly into .agents/skills
git clone https://github.com/RudyCity/codebase-wiki-generator.git .agents/skills/codebase-wiki-generator

# Run the installer to inject scripts and scaffold wiki
node .agents/skills/codebase-wiki-generator/scripts/install-skill.cjs
```

Or as a Git Submodule:
```bash
git submodule add https://github.com/RudyCity/codebase-wiki-generator.git .agents/skills/codebase-wiki-generator
```

### Global User-Level Agent Skill (All Workspaces)
```powershell
# Windows
git clone https://github.com/RudyCity/codebase-wiki-generator.git "$env:USERPROFILE\.gemini\antigravity\skills\codebase-wiki-generator"

# Linux / macOS
git clone https://github.com/RudyCity/codebase-wiki-generator.git ~/.gemini/antigravity/skills/codebase-wiki-generator
```

---

## 🛠️ Master CLI Usage

```bash
# Run via local installation
node .agents/skills/codebase-wiki-generator/bin/cli.cjs <command>

# Or via npm/pnpm scripts
pnpm wiki:scaffold
pnpm wiki:sync
pnpm wiki:watch
pnpm wiki:stop
pnpm wiki:validate
```

### Available CLI Commands

| Command | Action | Description |
|---|---|---|
| `scaffold` / `init` | `wiki scaffold` | Scaffolds `docs/wiki/` with initial 8-pillar structure & `wiki-config.json` |
| `sync` | `wiki sync` | Runs incremental or full wiki sync (API, ERD, Index, RAG memory) |
| `watch` | `wiki watch` | Starts background watcher daemon with auto-sync and duplicate PID auto-kill |
| `stop` | `wiki stop` | Gracefully stops any active watcher daemon |
| `status` | `wiki status` | Checks if the background watcher daemon is running |
| `validate` | `wiki validate` | Checks broken internal markdown links, heading anchors, and Mermaid blocks |
| `freshness` | `wiki freshness` | Audits documentation staleness vs git commit history |
| `extract-api` | `wiki extract-api` | Updates `03-api-and-contracts.md` with current backend endpoints |
| `extract-erd` | `wiki extract-erd` | Updates `02-domain-models-and-data.md` with Mermaid database ERD |
| `rmemory` | `wiki rmemory` | Chunks wiki markdown into semantic JSON for AI Vector RAG |
| `install-skill`| `wiki install-skill` | Installs skill and auto-configures `package.json` scripts |

---

## ⚙️ Configuration (`docs/wiki/wiki-config.json`)

Supports single repositories and federated multi-workspace setups:

```json
{
  "wikiDir": "docs/wiki",
  "title": "Project Architecture & Technical Wiki",
  "primaryWorkspace": {
    "name": "my-main-app",
    "displayName": "Main Application",
    "path": ".",
    "routes": ["apps/api/src/routes", "src/routes", "routes", "api"],
    "schemas": ["packages/db/src/migrations", "packages/db/src", "prisma", "src/db"]
  },
  "federatedWorkspaces": [
    {
      "name": "secondary-service",
      "displayName": "Secondary Service",
      "path": "../secondary-service",
      "routes": ["src/routes", "routes"],
      "schemas": ["src/db/migrations"]
    }
  ],
  "ragMemoryOutput": "apps/api/data/wiki-rmemory-chunks.json"
}
```

---

## 📑 Wiki Structure Standard

```
docs/wiki/
├── 00-index.md                    # Master index, system topology, package inventory
├── 01-architecture-overview.md    # C4 Container/Context models, tech stack matrix
├── 02-domain-models-and-data.md   # Entity models, Mermaid ERD, state machines
├── 03-api-and-contracts.md        # API Catalog, endpoints, auth guards, Zod schemas
├── 04-features-and-workflows.md   # Domain features, sequence diagrams, failure recovery
├── 05-infrastructure-and-devops.md# Docker topologies, env variables, logging architecture
├── 06-developer-onboarding.md     # 5-minute onboarding, commands, debugging runbooks
├── 07-adrs-and-decisions.md       # Architecture Decision Records (MADR format)
└── wiki-config.json               # Declarative workspace federation configuration
```

---

## 📄 Programmatic API Usage

```typescript
import { syncWiki, scaffoldWiki, validateLinks } from '@rudycity/codebase-wiki-generator';

// Run full wiki sync
syncWiki();

// Validate links
validateLinks({ wikiDir: 'docs/wiki' });
```

---

## 📄 License

MIT © [RudyCity](https://github.com/RudyCity)
