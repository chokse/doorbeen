// run-brand-pipeline.mjs
// Runs the full Doorbeen pipeline for a single brand in sequence:
//   1. refresh-brand-profile.mjs  — web research → brand_profiles + keywords
//   2. test-collect.mjs           — Reddit + Instagram + LinkedIn → raw_mentions
//   3. test-analyze.mjs           — Claude analysis → analyzed_mentions
//   4. generate-brief.mjs         — brief generation → briefs table
//
// Each step waits for the previous to complete.
// If any step fails (non-zero exit), the pipeline stops immediately.
//
// Usage:   node --env-file=.env run-brand-pipeline.mjs <brand-slug>
// Example: node --env-file=.env run-brand-pipeline.mjs minimalist

import { spawn }          from 'child_process';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI arg ───────────────────────────────────────────────────────────────
const BRAND = process.argv[2];
if (!BRAND) {
  console.error('Usage:   node --env-file=.env run-brand-pipeline.mjs <brand-slug>');
  console.error('Example: node --env-file=.env run-brand-pipeline.mjs minimalist');
  process.exit(1);
}

// ── Pipeline steps ─────────────────────────────────────────────────────────
const STEPS = [
  { label: '1 / 4 — Brand Profile Refresh', script: 'refresh-brand-profile.mjs' },
  { label: '2 / 4 — Data Collection',       script: 'test-collect.mjs'           },
  { label: '3 / 4 — Mention Analysis',      script: 'test-analyze.mjs'           },
  { label: '4 / 4 — Brief Generation',      script: 'generate-brief.mjs'         },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function header(text) {
  const bar = '═'.repeat(51);
  console.log(`\n${bar}`);
  console.log(` ${text}`);
  console.log(bar);
}

// Spawn script as a child process, inheriting stdio so output streams live.
// Children inherit process.env — env vars already loaded by --env-file=.env on parent.
function runStep(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, script), ...args],
      { stdio: 'inherit', cwd: __dirname }
    );
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`exited with code ${code}`));
    });
    child.on('error', err => reject(err));
  });
}

// ── Run ────────────────────────────────────────────────────────────────────
const startedAt = new Date();

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log(`   Doorbeen — Full Brand Pipeline`);
console.log(`   Brand  : ${BRAND}`);
console.log(`   Steps  : ${STEPS.length}`);
console.log(`   Started: ${startedAt.toISOString()}`);
console.log('╚═══════════════════════════════════════════════════╝');

for (const step of STEPS) {
  header(step.label);
  const stepStart = Date.now();
  try {
    await runStep(step.script, [BRAND]);
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
    console.log(`\n  ✓ ${step.label} — done in ${elapsed}s`);
  } catch (err) {
    console.error(`\n  ✗ Pipeline stopped at: ${step.label}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

const totalSecs = ((Date.now() - startedAt) / 1000).toFixed(0);

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log(`   Pipeline complete: ${BRAND}`);
console.log(`   Total time : ${totalSecs}s`);
console.log(`   Finished   : ${new Date().toISOString()}`);
console.log('╚═══════════════════════════════════════════════════╝\n');
