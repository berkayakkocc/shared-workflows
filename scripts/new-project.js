'use strict';
/**
 * Kullanım:
 *   node scripts/new-project.js --name my-app --lang python
 *   node scripts/new-project.js --name my-app --lang flutter --desc "Harika bir uygulama"
 *
 * Desteklenen diller: python | flutter | dotnet | node | go | rust
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ── Argümanları parse et ──────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}

const SUPPORTED = ['python', 'flutter', 'dotnet', 'node', 'go', 'rust'];
const SCRIPT_DIR  = __dirname;
const REPO_ROOT   = path.join(SCRIPT_DIR, '..');
const TEMPLATES   = path.join(REPO_ROOT, 'templates');
const GITHUB_USER = 'berkayakkocc';

// ── Yardımcı fonksiyonlar ────────────────────────────────────────────────────
function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
}

function copyDir(src, dest, replacements) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      let content = fs.readFileSync(srcPath);
      // Sadece metin dosyalarında placeholder değiştir
      if (!isBinary(entry.name)) {
        let text = content.toString('utf-8');
        for (const [placeholder, value] of Object.entries(replacements)) {
          text = text.replaceAll(placeholder, value);
        }
        content = Buffer.from(text, 'utf-8');
      }
      fs.writeFileSync(destPath, content);
    }
  }
}

function isBinary(filename) {
  const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip']);
  return binaryExts.has(path.extname(filename).toLowerCase());
}

function run(cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: 'inherit' });
  } catch {
    // git init başarısız olsa bile devam et
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// Dile göre README placeholder'larını doldur
function readmeVars(lang, slug) {
  const map = {
    python:  { install: 'pip install -r requirements.txt', dev: 'python src/app/main.py', test: 'pytest' },
    flutter: { install: 'flutter pub get',                  dev: 'flutter run',            test: 'flutter test' },
    dotnet:  { install: 'dotnet restore',                   dev: 'dotnet run --project src/App', test: 'dotnet test' },
    node:    { install: 'npm install',                      dev: 'npm run dev',            test: 'npm test' },
    go:      { install: 'go mod tidy',                      dev: 'go run ./cmd/...',       test: 'go test ./...' },
    rust:    { install: 'cargo build',                      dev: 'cargo run',              test: 'cargo test' },
  };
  return map[lang] || map.node;
}

// ── Ana akış ──────────────────────────────────────────────────────────────────
async function main() {
  let name = args.name;
  let lang = args.lang;
  let desc = args.desc || args.description || '';

  // İnteraktif mod — argüman verilmemişse sor
  if (!name) {
    name = await prompt('Proje adı: ');
  }
  if (!lang) {
    lang = await prompt(`Dil (${SUPPORTED.join(' | ')}): `);
  }
  if (!desc) {
    desc = await prompt('Kısa açıklama (boş bırakılabilir): ');
  }

  lang = lang.toLowerCase();
  if (!SUPPORTED.includes(lang)) {
    console.error(`Hata: desteklenmeyen dil "${lang}". Seçenekler: ${SUPPORTED.join(', ')}`);
    process.exit(1);
  }

  const slug    = slugify(name);
  const outDir  = path.join(REPO_ROOT, '..', slug);   // Generator/ kardeş klasörü

  if (fs.existsSync(outDir)) {
    console.error(`Hata: "${outDir}" zaten var.`);
    process.exit(1);
  }

  const replacements = {
    '{{PROJECT_NAME}}': name,
    '{{PROJECT_SLUG}}': slug,
    '{{DESCRIPTION}}':  desc || `${name} projesi`,
    '{{GITHUB_USER}}':  GITHUB_USER,
    '{{INSTALL_COMMAND}}': readmeVars(lang, slug).install,
    '{{DEV_COMMAND}}':     readmeVars(lang, slug).dev,
    '{{TEST_COMMAND}}':    readmeVars(lang, slug).test,
  };

  console.log(`\n→ Proje oluşturuluyor: ${outDir}`);
  console.log(`  Dil: ${lang} | Slug: ${slug}\n`);

  // 1. Base katmanı kopyala
  copyDir(path.join(TEMPLATES, '_base'), outDir, replacements);
  console.log('  ✓ Base dosyalar');

  // 2. Dil-spesifik katmanı üstüne kopyala
  copyDir(path.join(TEMPLATES, lang), outDir, replacements);
  console.log(`  ✓ ${lang} dosyaları`);

  // 3. Dil .gitignore'unu base'e ekle (birleştir)
  const baseGitignore = path.join(outDir, '.gitignore');
  const langGitignore = path.join(TEMPLATES, lang, '.gitignore');
  if (fs.existsSync(langGitignore) && fs.existsSync(baseGitignore)) {
    const extra = fs.readFileSync(langGitignore, 'utf-8');
    const base  = fs.readFileSync(baseGitignore, 'utf-8');
    if (!base.includes(extra.split('\n')[0])) {
      fs.appendFileSync(baseGitignore, '\n' + extra);
    }
  }
  console.log('  ✓ .gitignore birleştirildi');

  // 4. docs/ ve scripts/ klasörlerini oluştur
  fs.mkdirSync(path.join(outDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'scripts'), { recursive: true });
  console.log('  ✓ docs/ scripts/ klasörleri');

  // 5. git init + ilk commit
  run('git init -b main', outDir);
  run('git add .', outDir);
  run('git commit -m "chore: initial project scaffold"', outDir);
  console.log('  ✓ git init + ilk commit');

  // 6. GitHub repo oluştur ve push et
  const ghAvailable = (() => {
    try { execSync('gh --version', { stdio: 'pipe' }); return true; } catch { return false; }
  })();

  if (ghAvailable) {
    console.log('  → GitHub repo oluşturuluyor...');
    run(`gh repo create ${slug} --private --source=. --remote=origin --push`, outDir);
    console.log(`  ✓ GitHub repo oluşturuldu: github.com/${GITHUB_USER}/${slug}`);
  } else {
    console.log('  ⚠ gh CLI bulunamadı — GitHub repo manuel oluşturulacak');
  }

  const repoUrl = `https://github.com/${GITHUB_USER}/${slug}`;
  console.log(`\nHazır!\n  Lokal : ${outDir}\n  GitHub: ${ghAvailable ? repoUrl : '(manuel kurulacak)'}\n`);
  console.log('Sonraki adımlar:');
  if (!ghAvailable) {
    console.log(`  1. GitHub'da "${slug}" adında repo aç`);
    console.log(`  2. git remote add origin <url> && git push -u origin main`);
    console.log('  3. Repo Secrets\'a GH_PAT ekle');
  } else {
    console.log(`  1. ${repoUrl} → Settings → Secrets → GH_PAT ekle`);
  }
  console.log('  → STATUS.md\'yi doldur, çalışmaya başla\n');
}

main().catch(err => { console.error(err); process.exit(1); });
