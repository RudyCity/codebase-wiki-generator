#!/usr/bin/env node

/**
 * watch-and-sync.cjs
 * Multi-Workspace Real-time File Watcher Daemon with Smart Singleton:
 * Listens for file changes across primary and federated workspaces, invoking
 * incremental wiki synchronization with intelligent debouncing.
 * 
 * Guarantees SINGLETON execution: automatically detects and terminates any duplicate
 * watcher instances so only exactly ONE watcher process is running at all times.
 * 
 * Usage:
 *   node watch-and-sync.cjs [--config <file>] [--wiki-dir <dir>] [--debounce <ms>] [--stop] [--status]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = process.cwd();
const lockFilePath = path.join(rootDir, '.wiki-watcher.pid');
const syncerScript = path.resolve(__dirname, 'sync-wiki-on-change.cjs');

const args = process.argv.slice(2);
let configFile = 'docs/wiki/wiki-config.json';
let wikiDir = 'docs/wiki';
let debounceMs = 600;
let isStopCommand = false;
let isStatusCommand = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' || args[i] === '-c') {
    configFile = args[++i];
  } else if (args[i] === '--wiki-dir' || args[i] === '-w') {
    wikiDir = args[++i];
  } else if (args[i] === '--debounce' || args[i] === '-d') {
    debounceMs = parseInt(args[++i], 10) || 600;
  } else if (args[i] === '--stop') {
    isStopCommand = true;
  } else if (args[i] === '--status') {
    isStatusCommand = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Multi-Workspace Real-Time Wiki Auto-Sync Watcher Daemon
Usage:
  node watch-and-sync.cjs [options]

Options:
  --config, -c <file>      Path to wiki-config.json (default: docs/wiki/wiki-config.json)
  --wiki-dir, -w <dir>     Destination wiki directory (default: docs/wiki)
  --debounce, -d <ms>      Debounce delay in milliseconds (default: 600)
  --status                 Check if watcher daemon is currently running
  --stop                   Stop any currently running watcher daemon and exit
  --help, -h               Show this help message
    `);
    process.exit(0);
  }
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

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function terminatePid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Handle --status
if (isStatusCommand) {
  if (fs.existsSync(lockFilePath)) {
    try {
      const rawPid = fs.readFileSync(lockFilePath, 'utf8').trim();
      const pid = parseInt(rawPid, 10);
      if (!isNaN(pid) && isPidRunning(pid)) {
        console.log(`🟢 Wiki Watcher Daemon is RUNNING (PID: ${pid}).`);
        process.exit(0);
      }
    } catch (_) {}
  }
  console.log(`⚪ Wiki Watcher Daemon is NOT running.`);
  process.exit(0);
}

// Handle --stop
if (isStopCommand) {
  if (fs.existsSync(lockFilePath)) {
    try {
      const rawPid = fs.readFileSync(lockFilePath, 'utf8').trim();
      const pid = parseInt(rawPid, 10);
      if (!isNaN(pid) && isPidRunning(pid)) {
        console.log(`🛑 Stopping Wiki Watcher Daemon (PID: ${pid})...`);
        terminatePid(pid);
        console.log(`✅ Daemon stopped successfully.`);
      }
    } catch (_) {}
    try { fs.unlinkSync(lockFilePath); } catch (_) {}
  } else {
    console.log(`ℹ️ No active Wiki Watcher Daemon found.`);
  }
  process.exit(0);
}

// Check Singleton PID
if (fs.existsSync(lockFilePath)) {
  try {
    const rawPid = fs.readFileSync(lockFilePath, 'utf8').trim();
    const existingPid = parseInt(rawPid, 10);
    if (!isNaN(existingPid) && existingPid !== process.pid && isPidRunning(existingPid)) {
      console.log(`⚠️ Detected existing watcher daemon on PID ${existingPid}. Terminating old instance...`);
      terminatePid(existingPid);
    }
  } catch (_) {}
}

// Write current process PID to lockfile
try {
  fs.writeFileSync(lockFilePath, String(process.pid), 'utf8');
} catch (err) {
  console.warn(`⚠️ Could not create PID lockfile: ${err.message}`);
}

function cleanup() {
  if (fs.existsSync(lockFilePath)) {
    try {
      const stored = fs.readFileSync(lockFilePath, 'utf8').trim();
      if (parseInt(stored, 10) === process.pid) {
        fs.unlinkSync(lockFilePath);
      }
    } catch (_) {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

// Load Config
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

console.log(`\n👁️  Wiki Watcher Daemon started (PID: ${process.pid})`);
console.log(`⏱️  Debounce delay: ${debounceMs}ms`);
console.log(`📁 Monitored Workspaces (${workspaces.length}):`);
for (const ws of workspaces) {
  console.log(`  - ${ws.displayName} -> ${ws.baseDir}`);
}
console.log(`\nPress Ctrl+C or run 'wiki stop' to terminate.\n`);

let syncTimer = null;
const changedQueue = new Set();

function triggerSync() {
  if (syncTimer) clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    const fileList = Array.from(changedQueue);
    changedQueue.clear();

    console.log(`\n🔔 Change detected in ${fileList.length} file(s). Running auto-sync...`);
    try {
      execSync(`node "${syncerScript}" --config "${resolvedConfigPath}"`, {
        cwd: rootDir,
        stdio: 'inherit'
      });
    } catch (err) {
      console.error(`❌ Auto-sync failed: ${err.message}`);
    }
  }, debounceMs);
}

const ignoredPatterns = [
  /[\\/]\.git([\\/]|$)/,
  /[\\/]node_modules([\\/]|$)/,
  /[\\/]dist([\\/]|$)/,
  /[\\/]build([\\/]|$)/,
  /[\\/]\.next([\\/]|$)/,
  /[\\/]docs[\\/]wiki([\\/]|$)/,
  /\.log$/,
  /\.pid$/,
  /\.lock$/,
  /~$/
];

for (const ws of workspaces) {
  if (!fs.existsSync(ws.baseDir)) continue;

  try {
    fs.watch(ws.baseDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const norm = filename.replace(/\\/g, '/');
      if (ignoredPatterns.some(p => p.test(norm))) return;

      changedQueue.add(path.join(ws.baseDir, filename));
      triggerSync();
    });
  } catch (err) {
    console.warn(`⚠️ Could not attach recursive watcher to ${ws.displayName}: ${err.message}`);
  }
}
