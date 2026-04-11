const fs = require('fs');
const { execSync } = require('child_process');

const APP_JSON_PATH = './app.json';
const PACKAGE_JSON_PATH = './package.json';
const SECRET_STORE_PATH = './.secret.json';

// Read secrets
let secrets = {};
try {
  secrets = JSON.parse(fs.readFileSync(SECRET_STORE_PATH, 'utf8'));
} catch (err) {
  console.error('Missing or invalid .secret.json! You must create it with your publishing credentials.');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
const pkgJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

// Store original placeholders
const originalAppAuthor = appJson.author.name;
const originalAppEmail = appJson.author.email;
const originalAppPaypal = appJson.contributing?.donate?.paypal?.username;
const originalPkgAuthor = pkgJson.author;

// Inject real values for Homey App Store publication
appJson.author.name = secrets.AUTHOR_NAME || 'Hidden';
appJson.author.email = secrets.AUTHOR_EMAIL || 'hidden@hidden.com';
if (appJson.contributing && appJson.contributing.donate && appJson.contributing.donate.paypal) {
  appJson.contributing.donate.paypal.username = secrets.PAYPAL_USERNAME || '';
}

pkgJson.author = `${secrets.AUTHOR_NAME} <${secrets.AUTHOR_EMAIL}>`;

// Write temporarily
fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2));
fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2));

console.log('Secrets injected. Starting homey publish...');

try {
  // Use stdio: inherit to allow the user to see prompts from Homey CLI
  execSync('npx homey app publish', { stdio: 'inherit' });
} catch (e) {
  console.error('Publish failed or was interrupted.');
} finally {
  console.log('Restoring git placeholders...');
  appJson.author.name = originalAppAuthor;
  appJson.author.email = originalAppEmail;
  if (appJson.contributing && appJson.contributing.donate && appJson.contributing.donate.paypal) {
    appJson.contributing.donate.paypal.username = originalAppPaypal;
  }
  pkgJson.author = originalPkgAuthor;

  fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2));
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2));

  // Format to avoid git diff noise
  execSync('npx prettier --write app.json package.json');
}
