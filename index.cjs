/**
 * @rudycity/codebase-wiki-generator
 * Programmatic API Export
 */

const path = require('path');
const { execSync } = require('child_process');

const scriptsDir = path.resolve(__dirname, 'scripts');

function runScript(scriptName, args = [], options = {}) {
  const scriptPath = path.join(scriptsDir, scriptName);
  const cwd = options.cwd || process.cwd();
  return execSync(`node "${scriptPath}" ${args.join(' ')}`, {
    cwd,
    encoding: 'utf8',
    stdio: options.silent ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env }
  });
}

module.exports = {
  scaffoldWiki: (options = {}) => {
    const args = [];
    if (options.target) args.push('--target', `"${options.target}"`);
    if (options.force) args.push('--force');
    return runScript('generate-wiki-scaffold.cjs', args, options);
  },
  syncWiki: (options = {}) => {
    const args = [];
    if (options.config) args.push('--config', `"${options.config}"`);
    if (options.wikiDir) args.push('--wiki-dir', `"${options.wikiDir}"`);
    if (options.files) args.push('--files', `"${options.files.join(',')}"`);
    return runScript('sync-wiki-on-change.cjs', args, options);
  },
  extractApiCatalog: (options = {}) => {
    const args = [];
    if (options.config) args.push('--config', `"${options.config}"`);
    if (options.updateWiki) args.push('--update-wiki');
    if (options.output) args.push('--output', `"${options.output}"`);
    return runScript('extract-api-catalog.cjs', args, options);
  },
  extractDbErd: (options = {}) => {
    const args = [];
    if (options.config) args.push('--config', `"${options.config}"`);
    if (options.updateWiki) args.push('--update-wiki');
    return runScript('extract-db-erd.cjs', args, options);
  },
  validateLinks: (options = {}) => {
    const args = [];
    if (options.wikiDir) args.push('--wiki-dir', `"${options.wikiDir}"`);
    return runScript('validate-wiki-links.cjs', args, options);
  },
  validateFreshness: (options = {}) => {
    const args = [];
    if (options.wikiDir) args.push('--wiki-dir', `"${options.wikiDir}"`);
    return runScript('validate-wiki-freshness.cjs', args, options);
  },
  syncRMemory: (options = {}) => {
    const args = [];
    if (options.config) args.push('--config', `"${options.config}"`);
    if (options.wikiDir) args.push('--wiki-dir', `"${options.wikiDir}"`);
    if (options.output) args.push('--output-json', `"${options.output}"`);
    return runScript('sync-wiki-to-rmemory.cjs', args, options);
  }
};
