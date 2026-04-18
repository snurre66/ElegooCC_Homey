/**
 * Safe publish script for the Elegoo Homey app.
 *
 * Strategy:
 * 1. Inject secrets into .homeycompose/app.json and package.json
 * 2. Run `homey app publish` (which compose → validate → upload)
 * 3. Restore placeholders via `git checkout` (crash-safe)
 *
 * This approach is crash-safe because the `finally` block uses
 * `git checkout` to restore files, which works even if publish
 * crashes or is interrupted with CTRL+C.
 */
const fs = require('fs');
const { execSync } = require('child_process');

const COMPOSE_APP_PATH = './.homeycompose/app.json';
const PACKAGE_JSON_PATH = './package.json';
const SECRET_STORE_PATH = './.secret.json';

// Files that get secrets injected (used for git restore)
const MODIFIED_FILES = [COMPOSE_APP_PATH, PACKAGE_JSON_PATH];

// ── Read Secrets ────────────────────────────────────────
let secrets = {};
try {
  secrets = JSON.parse(fs.readFileSync(SECRET_STORE_PATH, 'utf8'));
} catch (err) {
  console.error('❌ Missing or invalid .secret.json!');
  console.error('   Create it from .secret.json.example with your publishing credentials.');
  process.exit(1);
}

if (!secrets.AUTHOR_NAME || !secrets.AUTHOR_EMAIL) {
  console.error('❌ .secret.json must contain AUTHOR_NAME and AUTHOR_EMAIL.');
  process.exit(1);
}

// ── Inject Secrets ──────────────────────────────────────
const composeApp = JSON.parse(fs.readFileSync(COMPOSE_APP_PATH, 'utf8'));
const pkgJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

composeApp.author.name = secrets.AUTHOR_NAME;
composeApp.author.email = secrets.AUTHOR_EMAIL;
if (composeApp.contributing?.donate?.paypal) {
  composeApp.contributing.donate.paypal.username = secrets.PAYPAL_USERNAME || '';
}

pkgJson.author = `${secrets.AUTHOR_NAME} <${secrets.AUTHOR_EMAIL}>`;

fs.writeFileSync(COMPOSE_APP_PATH, JSON.stringify(composeApp, null, 2));
fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2));

console.log('✅ Secrets injected. Starting homey app publish...');

// ── Publish ─────────────────────────────────────────────
try {
  execSync('npx homey app publish', { stdio: 'inherit' });
  console.log('✅ Publish completed successfully.');
} catch (e) {
  console.error('❌ Publish failed or was interrupted.');
} finally {
  // ── Crash-Safe Restore ──────────────────────────────
  console.log('🔄 Restoring placeholder values via git checkout...');
  try {
    execSync(`git checkout -- ${MODIFIED_FILES.join(' ')}`, { stdio: 'inherit' });
    console.log('✅ Files restored to git state (placeholders).');
  } catch (gitErr) {
    // Fallback: manual restore if git checkout fails (e.g., not a git repo)
    console.warn('⚠️  git checkout failed, restoring manually...');
    composeApp.author.name = '<HIDDEN>';
    composeApp.author.email = '<HIDDEN>';
    if (composeApp.contributing?.donate?.paypal) {
      composeApp.contributing.donate.paypal.username = '<HIDDEN>';
    }
    pkgJson.author = '<HIDDEN>';
    fs.writeFileSync(COMPOSE_APP_PATH, JSON.stringify(composeApp, null, 2));
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2));
    execSync('npx prettier --write .homeycompose/app.json package.json');
    console.log('✅ Files restored manually.');
  }
}
