# Codebase Wiki Generator & Auto-Sync Suite 📚

> **Multi-dimensional codebase wiki generation, C4 architecture diagrams, ERD extraction, API cataloging, and automatic real-time synchronization suite for Single Repositories and Federated Multi-Workspace projects.**

Compatible as an **AI Agent Skill** (Antigravity, Claude Code, Cursor, Codex) or as a **Standalone CLI Toolchain** with zero external runtime dependencies (pure Node.js).

---

## 🚀 Key Features

* **Complete Architecture Wiki Scaffolding**: Automatically creates structured 8-pillar wiki documentation (`00-index.md` to `07-adrs-and-decisions.md`).
* **Automated API Cataloging**: Scans routes (`Hono`, `Express`, `Fastify`, `Next.js`, `REST`) and generates complete endpoint tables with method, path, handler, and auth guards.
* **Automated ERD & Schema Extraction**: Scans SQL migrations, Drizzle, Prisma, or TypeORM schemas and outputs Mermaid Entity Relationship Diagrams.
* **Smart Singleton Watcher Daemon**: Watches file changes across primary and federated workspaces and automatically synchronizes the wiki in real-time.
* **Semantic RAG Memory Sync**: Auto-chunks wiki pages into vector/JSON embeddings for AI assistants and customer agents (`rMemory`).
* **Wiki Link & Freshness Auditing**: Scans broken internal links, anchors, and flags outdated pages against recent Git commit hashes.
* **Zero NPM Runtime Dependencies**: Built entirely with native Node.js built-ins (`fs`, `path`, `crypto`, `child_process`).

---

## 📦 Installation Options

### Option 1: Install as an Agent Skill in any Project (Recommended)

To install this skill into your project's agent skills directory:

```bash
# In your target project root:
mkdir -p .agents/skills
git clone https://github.com/RudyCity/codebase-wiki-generator.git .agents/skills/codebase-wiki-generator
```

Or as a Git Submodule:
```bash
git submodule add https://github.com/RudyCity/codebase-wiki-generator.git .agents/skills/codebase-wiki-generator
```

### Option 2: Global / User-Level Agent Skill

To make this skill available across all your Antigravity workspaces:

```bash
# Windows
git clone https://github.com/RudyCity/codebase-wiki-generator.git "$env:USERPROFILE\.gemini\antigravity\skills\codebase-wiki-generator"

# Linux / macOS
git clone https://github.com/RudyCity/codebase-wiki-generator.git ~/.gemini/antigravity/skills/codebase-wiki-generator
```

### Option 3: Install via Git URL (NPM / PNPM)

```bash
pnpm add -D git+https://github.com/RudyCity/codebase-wiki-generator.git
# or
npm install --save-dev git+https://github.com/RudyCity/codebase-wiki-generator.git
```

---

## 🛠️ CLI Usage & Commands

| Task | Command | Description |
|---|---|---|
| **Scaffold Wiki** | `node .agents/skills/codebase-wiki-generator/scripts/generate-wiki-scaffold.cjs` | Scaffolds `docs/wiki/` with initial structure & config |
| **Sync All** | `node .agents/skills/codebase-wiki-generator/scripts/sync-wiki-on-change.cjs` | Runs full wiki sync (ERD, APIs, RAG memory chunks) |
| **Watch Daemon** | `node .agents/skills/codebase-wiki-generator/scripts/watch-and-sync.cjs` | Starts background watcher with auto-sync & duplicate PID kill |
| **Extract APIs** | `node .agents/skills/codebase-wiki-generator/scripts/extract-api-catalog.cjs` | Updates `03-api-and-contracts.md` |
| **Extract ERD** | `node .agents/skills/codebase-wiki-generator/scripts/extract-db-erd.cjs` | Updates `02-domain-models-and-data.md` |
| **Validate Links** | `node .agents/skills/codebase-wiki-generator/scripts/validate-wiki-links.cjs` | Checks broken markdown links and anchors |
| **Check Freshness**| `node .agents/skills/codebase-wiki-generator/scripts/validate-wiki-freshness.cjs` | Identifies stale documentation vs git history |
| **RAG Memory** | `node .agents/skills/codebase-wiki-generator/scripts/sync-wiki-to-rmemory.cjs` | Chunks markdown for AI Vector RAG |

### Recommended `package.json` Scripts in Target Project:

```json
{
  "scripts": {
    "wiki:scaffold": "node .agents/skills/codebase-wiki-generator/scripts/generate-wiki-scaffold.cjs",
    "wiki:sync": "node .agents/skills/codebase-wiki-generator/scripts/sync-wiki-on-change.cjs",
    "wiki:watch": "node .agents/skills/codebase-wiki-generator/scripts/watch-and-sync.cjs",
    "wiki:validate": "node .agents/skills/codebase-wiki-generator/scripts/validate-wiki-links.cjs"
  }
}
```

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
    "apiRoutesDir": "apps/api/src/routes",
    "migrationsDir": "packages/db/src/migrations"
  },
  "federatedWorkspaces": [
    {
      "name": "secondary-service",
      "displayName": "Secondary Service",
      "path": "../secondary-service",
      "apiRoutesDir": "src/routes"
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

## 📄 License

MIT © [RudyCity](https://github.com/RudyCity)
