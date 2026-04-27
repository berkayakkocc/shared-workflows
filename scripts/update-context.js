'use strict';
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.cwd();

const SKIP_DIRS  = new Set(['.git','node_modules','.next','out','build','.dart_tool','.pub-cache','.pub','__pycache__','dist','target']);
const SKIP_FILES = new Set(['.gitkeep','package-lock.json','yarn.lock','pubspec.lock']);
const SKIP_EXTS  = new Set(['.jpg','.jpeg','.png','.gif','.webp','.ico','.svg','.woff','.woff2','.ttf','.eot']);

function detectType() {
  if (fs.existsSync(path.join(ROOT, 'pubspec.yaml')))     return 'flutter';
  if (fs.existsSync(path.join(ROOT, 'package.json')))     return 'node';
  if (fs.existsSync(path.join(ROOT, 'requirements.txt'))) return 'python';
  if (fs.existsSync(path.join(ROOT, 'Cargo.toml')))       return 'rust';
  if (fs.existsSync(path.join(ROOT, 'go.mod')))           return 'go';
  return 'unknown';
}

function readDescription() {
  const readme = path.join(ROOT, 'README.md');
  if (fs.existsSync(readme)) {
    for (const line of fs.readFileSync(readme, 'utf-8').split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#') && !t.startsWith('!') && !t.startsWith('[')) return t;
    }
  }
  try { const p = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf-8')); return p.description || p.name || '—'; } catch {}
  try { const m = fs.readFileSync(path.join(ROOT,'pubspec.yaml'),'utf-8').match(/^description:\s*(.+)/m); if (m) return m[1].trim(); } catch {}
  return '—';
}

function git(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', cwd: ROOT, stdio: ['pipe','pipe','pipe'] }).trim(); }
  catch { return '—'; }
}

function readPkg(type) {
  if (type === 'node') {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf-8'));
      return { name: p.name||'unknown', version: p.version||'0.0.0', deps: p.dependencies||{}, devDeps: p.devDependencies||{}, scripts: p.scripts||{} };
    } catch {}
  }
  if (type === 'flutter') {
    try {
      const pub  = fs.readFileSync(path.join(ROOT,'pubspec.yaml'),'utf-8');
      const deps = {};
      const sec  = (pub.match(/^dependencies:([\s\S]*?)(?=^\w)/m) || ['',''])[1];
      for (const m of sec.matchAll(/^\s{2}(\w[\w_-]+):\s*(.+)/gm))
        if (m[1] !== 'flutter' && m[1] !== 'sdk') deps[m[1]] = m[2].trim();
      return {
        name:    (pub.match(/^name:\s*(.+)/m)    || [,'unknown'])[1].trim(),
        version: (pub.match(/^version:\s*(.+)/m) || [,'0.0.0'])[1].trim(),
        deps, devDeps: {},
        scripts: { run: 'flutter run', build: 'flutter build apk', test: 'flutter test' },
      };
    } catch {}
  }
  return { name: 'unknown', version: '0.0.0', deps: {}, devDeps: {}, scripts: {} };
}

function scanSecrets() {
  const wfDir = path.join(ROOT, '.github', 'workflows');
  if (!fs.existsSync(wfDir)) return [];
  const s = new Set();
  for (const f of fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f)))
    for (const m of fs.readFileSync(path.join(wfDir,f),'utf-8').matchAll(/secrets\.(\w+)/g)) s.add(m[1]);
  return [...s].sort();
}

function parseWorkflows() {
  const wfDir = path.join(ROOT, '.github', 'workflows');
  if (!fs.existsSync(wfDir)) return [];
  return fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f)).map(file => {
    const raw  = fs.readFileSync(path.join(wfDir, file), 'utf-8');
    const name = (raw.match(/^name:\s*(.+)/m) || [, file])[1].trim();
    const triggers = [];
    if (/^\s+push:/m.test(raw))              triggers.push('push');
    if (/^\s+pull_request:/m.test(raw))      triggers.push('pull_request');
    if (/^\s+workflow_dispatch:/m.test(raw)) triggers.push('manual');
    if (/^\s+schedule:/m.test(raw))          triggers.push('schedule');
    if (/^\s+workflow_call:/m.test(raw))     triggers.push('reusable');
    const crons = []; let m;
    const re = /cron:\s*['"]([^'"]+)['"]\s*(?:#\s*(.+))?/g;
    while ((m = re.exec(raw)) !== null) crons.push(m[2] ? `${m[1].trim()} (${m[2].trim()})` : m[1].trim());
    return { file, name, triggers, crons };
  });
}

function scanTodos() {
  const EXTS = new Set(['.js','.ts','.tsx','.dart','.py','.go','.md','.yml','.yaml','.swift','.kt']);
  const RE   = /\b(TODO|FIXME|HACK|XXX)\b/;
  const hits = [];
  function scan(dir) {
    let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const f of e) {
      if (SKIP_DIRS.has(f.name)) continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { scan(full); continue; }
      if (!EXTS.has(path.extname(f.name).toLowerCase())) continue;
      let lines; try { lines = fs.readFileSync(full, 'utf-8').split('\n'); } catch { continue; }
      lines.forEach((l, i) => { if (RE.test(l)) hits.push({ file: path.relative(ROOT, full).replace(/\\/g, '/'), line: i+1, text: l.trim() }); });
    }
  }
  scan(ROOT);
  return hits;
}

function walkTree(dir, base) {
  base = base || '';
  const results = [];
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const f of e) {
    if (SKIP_DIRS.has(f.name) || SKIP_FILES.has(f.name)) continue;
    const rel = base ? `${base}/${f.name}` : f.name;
    if (f.isDirectory()) results.push(...walkTree(path.join(dir, f.name), rel));
    else if (!SKIP_EXTS.has(path.extname(f.name).toLowerCase())) results.push(rel);
  }
  return results;
}

function main() {
  console.log('[update-context] Scanning...');
  const type      = detectType();
  const desc      = readDescription();
  const remote    = git('git remote get-url origin');
  const gitLog    = git('git log --oneline -10');
  const pkg       = readPkg(type);
  const workflows = parseWorkflows();
  const todos     = scanTodos();
  const secrets   = scanSecrets();
  const files     = walkTree(ROOT);
  const ts        = new Date().toUTCString();

  console.log(`  type=${type} files=${files.length} workflows=${workflows.length} todos=${todos.length}`);

  const wfRows   = workflows.length ? workflows.map(w => `| \`${w.file}\` | ${w.name} | ${w.triggers.join(', ')} | ${w.crons.length ? w.crons.join(', ') : '—'} |`).join('\n') : '| — | — | — | — |';
  const secRows  = secrets.length   ? secrets.map(s => `| \`${s}\` | GitHub → Settings → Secrets → Actions |`).join('\n') : '| — | No secrets detected |';
  const depRows  = Object.entries(pkg.deps).map(([k,v]) => `| \`${k}\` | \`${v}\` |`).join('\n')    || '| — | — |';
  const devRows  = Object.entries(pkg.devDeps).map(([k,v]) => `| \`${k}\` | \`${v}\` (dev) |`).join('\n');
  const scripts  = Object.keys(pkg.scripts).length ? Object.entries(pkg.scripts).map(([k,v]) => `  ${k}: ${v}`).join('\n') : '  (none)';
  const todoBlock = todos.length ? todos.map(t => `- \`${t.file}:${t.line}\` — \`${t.text}\``).join('\n') : '_No TODO/FIXME found._';

  const md = `# PROJECT CONTEXT — ${pkg.name}

> Auto-generated — do not edit manually. Last updated: **${ts}**

## Overview
| Field | Value |
|---|---|
| Name | ${pkg.name} |
| Version | ${pkg.version} |
| Type | ${type} |
| Repository | ${remote} |
| Description | ${desc} |

## Workflows
| File | Name | Triggers | Cron |
|---|---|---|---|
${wfRows}

## Secrets Required
| Secret | How to Add |
|---|---|
${secRows}

## Dependencies
| Package | Version |
|---|---|
${depRows}
${devRows}

## Commands
\`\`\`
${scripts}
\`\`\`

## Files (${files.length})
\`\`\`
${files.join('\n')}
\`\`\`

## TODO / FIXME
${todoBlock}

## Recent Git History
\`\`\`
${gitLog}
\`\`\`
`;

  fs.writeFileSync(path.join(ROOT, 'PROJECT_CONTEXT.md'), md, 'utf-8');
  console.log(`[update-context] Done (${(md.length/1024).toFixed(1)} KB)`);
}

main();
