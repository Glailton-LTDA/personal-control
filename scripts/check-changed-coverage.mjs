import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const base = process.env.COVERAGE_BASE || 'origin/main';
if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.^~-]*$/.test(base)) throw new Error('Invalid coverage base');
const baseline = git('rev-parse', '--verify', `${base}^{commit}`);
const coverage = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'));
const changes = new Map();
const production = (file) => /^src\/.*\.(js|jsx)$/.test(file) && !/\.(test|spec)\.(js|jsx)$/.test(file) && !file.startsWith('src/tests/');
let file;
for (const line of git('diff', '--unified=0', '--diff-filter=AM', baseline, '--', 'src').split('\n')) {
  if (line.startsWith('+++ b/')) {
    file = line.slice(6);
    if (production(file)) changes.set(file, new Set());
  }
  const match = line.match(/^@@ .* \+(\d+)(?:,(\d+))? @@/);
  if (match && changes.has(file)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let n = start; n < start + count; n++) changes.get(file).add(n);
  }
}
for (const candidate of git('ls-files', '--others', '--exclude-standard', '--', 'src').split('\n').filter(production)) {
  changes.set(candidate, new Set(readFileSync(candidate, 'utf8').split('\n').map((_, i) => i + 1)));
}
const totals = Object.fromEntries(['lines','statements','functions','branches'].map((key) => [key, []]));
for (const [name, lines] of changes) {
  if (!lines.size) continue;
  const data = coverage[path.resolve(name)];
  if (!data) throw new Error(`Missing production coverage: ${name}`);
  const lineHits = new Map();
  for (const [id, location] of Object.entries(data.statementMap)) {
    if (!lines.has(location.start.line)) continue;
    totals.statements.push(data.s[id]);
    lineHits.set(location.start.line, Math.max(lineHits.get(location.start.line) || 0, data.s[id]));
  }
  totals.lines.push(...lineHits.values());
  for (const [id, location] of Object.entries(data.fnMap)) {
    if (lines.has(location.decl.start.line)) totals.functions.push(data.f[id]);
  }
  for (const [id, location] of Object.entries(data.branchMap)) {
    for (let i = 0; i < location.locations.length; i++) {
      if (lines.has(location.locations[i].start.line)) totals.branches.push(data.b[id][i]);
    }
  }
}
let failed = false;
for (const [metric, counts] of Object.entries(totals)) {
  const percent = counts.length ? counts.filter((count) => count > 0).length / counts.length * 100 : null;
  console.log(`Changed ${metric}: ${percent === null ? 'not applicable' : `${percent.toFixed(2)}%`}`);
  if (percent !== null && percent < 75) failed = true;
}
if (failed) process.exitCode = 1;
