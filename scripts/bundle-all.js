#!/usr/bin/env node

/**
 * Bundle all k6 scenarios for K8s distributed execution.
 * Creates self-contained bundles that include all dependencies.
 *
 * Usage:
 *   node scripts/bundle-all.js
 *   node scripts/bundle-all.js --scenario bl01
 *   node scripts/bundle-all.js --category baseline
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    scenario: null,
    category: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scenario" && args[i + 1]) {
      options.scenario = args[++i];
    } else if (args[i] === "--category" && args[i + 1]) {
      options.category = args[++i];
    } else if (args[i] === "--verbose" || args[i] === "-v") {
      options.verbose = true;
    }
  }

  return options;
}

function findScenarios(options) {
  const scenariosDir = path.join(ROOT, "scenarios");
  const scenarios = [];

  function scanDir(dir, category) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, entry);
      } else if (entry.endsWith(".js")) {
        const scenarioId = entry.replace(".js", "");

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

  scanDir(scenariosDir, "");
  return scenarios;
}

function bundle(options) {
  console.log("🔧 Building k6 scenario bundles...\n");

  const distDir = path.join(ROOT, "dist");
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  try {
    const webpackCmd = options.verbose
      ? "npx webpack --config webpack.config.js --stats verbose"
      : "npx webpack --config webpack.config.js";

    console.log("Running webpack...");
    execSync(webpackCmd, {
      cwd: ROOT,
      stdio: "inherit",
    });

    console.log("\n✅ Bundles created in dist/\n");

    const scenarios = findScenarios(options);
    console.log("📦 Bundled scenarios:");
    scenarios.forEach((s) => {
      const bundlePath = `dist/${s.category}/${s.id}.bundle.js`;
      console.log(`   - ${s.id} (${s.category})`);
    });

    console.log("\n📋 To deploy to K8s:");
    console.log("   kubectl create configmap k6-scenarios --from-file=dist/");
    console.log("   # Or use the updated run-distributed.sh script");
  } catch (error) {
    console.error("❌ Bundle failed:", error.message);
    process.exit(1);
  }
}

const options = parseArgs();
bundle(options);
