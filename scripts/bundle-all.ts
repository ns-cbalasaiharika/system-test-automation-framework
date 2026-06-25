#!/usr/bin/env ts-node

/**
 * Bundle all k6 scenarios for K8s distributed execution.
 * Creates self-contained bundles that include all dependencies.
 *
 * Usage:
 *   npx ts-node scripts/bundle-all.ts
 *   npx ts-node scripts/bundle-all.ts --scenario bl01
 *   npx ts-node scripts/bundle-all.ts --category baseline
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

interface BundleOptions {
  scenario: string | null;
  category: string | null;
  verbose: boolean;
}

interface ScenarioInfo {
  id: string;
  category: string;
  path: string;
  relativePath: string;
}

function parseArgs(): BundleOptions {
  const args = process.argv.slice(2);
  const options: BundleOptions = {
    scenario: null,
    category: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) {
      options.scenario = args[++i];
    } else if (args[i] === '--category' && args[i + 1]) {
      options.category = args[++i];
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      options.verbose = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Bundle all k6 scenarios for K8s distributed execution.

Usage:
  npx ts-node scripts/bundle-all.ts [options]

Options:
  --scenario <id>    Bundle only scenarios matching this ID prefix
  --category <name>  Bundle only scenarios in this category (baseline, single-fault, etc.)
  --verbose, -v      Show verbose webpack output
  --help, -h         Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

function findScenarios(options: BundleOptions): ScenarioInfo[] {
  const scenariosDir = path.join(ROOT, 'scenarios');
  const scenarios: ScenarioInfo[] = [];

  function scanDir(dir: string, category: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, entry);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        const scenarioId = entry.replace('.ts', '');

        if (options.scenario && !scenarioId.includes(options.scenario)) {
          continue;
        }
        if (options.category && category !== options.category) {
          continue;
        }

        scenarios.push({
          id: scenarioId,
          category,
          path: fullPath,
          relativePath: `scenarios/${category}/${entry}`,
        });
      }
    }
  }

  scanDir(scenariosDir, '');
  return scenarios;
}

function bundle(options: BundleOptions): void {
  console.log('Building k6 scenario bundles...\n');

  const distDir = path.join(ROOT, 'dist');
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  try {
    const webpackCmd = options.verbose
      ? 'npx webpack --config webpack.config.ts --stats verbose'
      : 'npx webpack --config webpack.config.ts';

    console.log('Running webpack...');
    execSync(webpackCmd, {
      cwd: ROOT,
      stdio: 'inherit',
    });

    console.log('\nBundles created in dist/\n');

    const scenarios = findScenarios(options);
    console.log('Bundled scenarios:');
    scenarios.forEach((s) => {
      console.log(`   - ${s.id} (${s.category})`);
    });

    console.log('\nTo deploy to K8s:');
    console.log('   kubectl create configmap k6-scenarios --from-file=dist/');
    console.log('   # Or use: make run-k8s SCENARIO=<id>');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Bundle failed:', message);
    process.exit(1);
  }
}

const options = parseArgs();
bundle(options);
