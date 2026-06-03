/**
 * Skill Validation Script
 * Scans the skills/ directory and validates:
 * - Every .toml has a corresponding .js entry point
 * - Every .js has a valid main() export
 * - Descriptor fields are complete
 *
 * Usage: node scripts/validate-skills.js
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

let errors = [];
let warnings = [];

function walkDir(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.toml')) {
      files.push(fullPath);
    }
  }
  return files;
}

function validate() {
  const tomFiles = walkDir(SKILLS_DIR);

  if (tomFiles.length === 0) {
    warnings.push('No .toml skill descriptors found');
    process.exit(0);
  }

  for (const tomlPath of tomFiles) {
    const dir = path.dirname(tomlPath);
    const content = fs.readFileSync(tomlPath, 'utf8');

    // Basic TOML parsing (no dep on toml library)
    const name = content.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const description = content.match(/^description\s*=\s*"([^"]+)"/m)?.[1];
    const version = content.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const entryPoint = content.match(/^entry_point\s*=\s*"([^"]+)"/m)?.[1];
    const permissionClass = content.match(/^permission_class\s*=\s*"([^"]+)"/m)?.[1];

    if (!name) errors.push(`${tomlPath}: missing 'name' field`);
    if (!description) errors.push(`${tomlPath}: missing 'description' field`);
    if (!version) errors.push(`${tomlPath}: missing 'version' field`);
    if (!entryPoint) errors.push(`${tomlPath}: missing 'entry_point' field`);
    if (!permissionClass) errors.push(`${tomlPath}: missing 'permission_class' field`);

    // Check entry point exists
    if (entryPoint) {
      const jsPath = path.join(dir, entryPoint);
      if (!fs.existsSync(jsPath)) {
        errors.push(`${tomlPath}: entry point '${entryPoint}' not found at ${jsPath}`);
      } else {
        // Check that JS file exports main
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        if (!jsContent.includes('module.exports') && !jsContent.includes('exports.main')) {
          warnings.push(`${jsPath}: may not export 'main' function`);
        }
      }
    }

    // Check for orphan .js files (no matching .toml)
    const jsFiles = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    for (const jsFile of jsFiles) {
      if (jsFile !== entryPoint) {
        warnings.push(`${path.join(dir, jsFile)}: orphan .js file (no matching .toml entry_point)`);
      }
    }
  }

  // Report
  console.log(`\n=== Skill Validation Report ===\n`);
  console.log(`Scanned: ${tomFiles.length} skill(s)`);
  console.log(`Errors:   ${errors.length}`);
  console.log(`Warnings: ${warnings.length}\n`);

  for (const err of errors) {
    console.log(`❌ ${err}`);
  }
  for (const warn of warnings) {
    console.log(`⚠️  ${warn}`);
  }

  if (errors.length > 0) {
    console.log(`\n❌ Validation FAILED — fix errors above`);
    process.exit(1);
  } else {
    console.log(`\n✅ Validation PASSED`);
    process.exit(0);
  }
}

validate();
