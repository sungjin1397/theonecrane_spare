const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, '_gabia_upload');

const INCLUDE_PATHS = [
  'server.js',
  'package.json',
  'package-lock.json',
  'public',
  'shared',
  'data'
];

const EXCLUDED_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '.env.example',
  '.gitignore',
  '.agent.md'
]);

const EXCLUDED_EXTENSIONS = new Set([
  '.md'
]);

function removeDirSafe(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function shouldSkipByName(name) {
  if (EXCLUDED_BASENAMES.has(name)) return true;
  if (name.startsWith('.env.')) return true;
  return false;
}

function shouldSkipByExtension(name) {
  const ext = path.extname(name).toLowerCase();
  return EXCLUDED_EXTENSIONS.has(ext);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    const base = path.basename(src);
    if (shouldSkipByName(base)) return;

    ensureDir(dest);
    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      if (shouldSkipByName(entry) || shouldSkipByExtension(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  const base = path.basename(src);
  if (shouldSkipByName(base) || shouldSkipByExtension(base)) return;

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function main() {
  removeDirSafe(outDir);
  ensureDir(outDir);

  for (const relativePath of INCLUDE_PATHS) {
    const src = path.join(rootDir, relativePath);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(outDir, relativePath);
    copyRecursive(src, dest);
  }

  const manifestPath = path.join(outDir, 'DEPLOY_MANIFEST.txt');
  const manifest = [
    'THE ONE CRANE SPARE - Gabia Upload Package',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'Included:',
    ...INCLUDE_PATHS.map(item => `- ${item}`),
    '',
    'Excluded:',
    '- .env and .env.*',
    '- *.md',
    '- .gitignore',
    '- .agent.md'
  ].join('\n');

  fs.writeFileSync(manifestPath, manifest, 'utf8');

  console.log('[pack:gabia] Done. Upload this folder to Gabia:');
  console.log(outDir);
}

main();
