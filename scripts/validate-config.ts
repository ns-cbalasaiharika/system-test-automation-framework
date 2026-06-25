#!/usr/bin/env npx ts-node
/**
 * Config Validation Script
 * 
 * Validates YAML configuration files for correctness:
 * - Traffic mix sums to 100
 * - SLO metric names are valid
 * - Required fields are present
 * - References to services exist
 * - Paths and file references are valid
 * 
 * Usage: npx ts-node scripts/validate-config.ts [--fix]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// =============================================================================
// Types
// =============================================================================

interface ValidationError {
  file: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  fixable?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  filesChecked: number;
}

interface ScenarioYAML {
  id: string;
  name: string;
  category: string;
  priority: string;
  service: string;
  trafficMix: Record<string, number>;
  slos: Record<string, unknown>;
  [key: string]: unknown;
}

interface EnvironmentYAML {
  name: string;
  services: Record<string, string>;
  defaults?: Record<string, unknown>;
}

interface ProfileYAML {
  name: string;
  executor?: string;
  stages?: Array<{ duration: string; target: number }>;
  thresholdMultiplier: number;
}

// =============================================================================
// Validators
// =============================================================================

function validateTrafficMix(
  trafficMix: Record<string, number>,
  file: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!trafficMix || typeof trafficMix !== 'object') {
    errors.push({
      file,
      field: 'trafficMix',
      message: 'trafficMix is required and must be an object',
      severity: 'error',
    });
    return errors;
  }
  
  const total = Object.values(trafficMix).reduce((sum, val) => sum + val, 0);
  
  if (Math.abs(total - 100) > 0.01) {
    errors.push({
      file,
      field: 'trafficMix',
      message: `trafficMix weights sum to ${total}, should be 100`,
      severity: 'error',
      fixable: true,
    });
  }
  
  for (const [key, value] of Object.entries(trafficMix)) {
    if (typeof value !== 'number' || value < 0) {
      errors.push({
        file,
        field: `trafficMix.${key}`,
        message: `Invalid weight: ${value}. Must be a positive number.`,
        severity: 'error',
      });
    }
  }
  
  return errors;
}

function validateSLOs(
  slos: Record<string, unknown>,
  file: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!slos || typeof slos !== 'object') {
    errors.push({
      file,
      field: 'slos',
      message: 'slos is required and must be an object',
      severity: 'error',
    });
    return errors;
  }
  
  const validLatencyKeys = ['p50', 'p95', 'p99'];
  const validErrorKeys = ['rate'];
  
  for (const [metric, thresholds] of Object.entries(slos)) {
    if (typeof thresholds !== 'object' || thresholds === null) {
      errors.push({
        file,
        field: `slos.${metric}`,
        message: 'SLO threshold must be an object',
        severity: 'error',
      });
      continue;
    }
    
    const keys = Object.keys(thresholds as Record<string, unknown>);
    
    // Check if it's a latency SLO or error SLO
    const isLatencySLO = keys.some(k => validLatencyKeys.includes(k));
    const isErrorSLO = keys.some(k => validErrorKeys.includes(k));
    
    if (!isLatencySLO && !isErrorSLO) {
      errors.push({
        file,
        field: `slos.${metric}`,
        message: `Unknown SLO type. Expected one of: ${[...validLatencyKeys, ...validErrorKeys].join(', ')}`,
        severity: 'warning',
      });
    }
    
    // Validate latency values
    for (const key of keys) {
      const value = (thresholds as Record<string, unknown>)[key];
      if (typeof value !== 'number' || value < 0) {
        errors.push({
          file,
          field: `slos.${metric}.${key}`,
          message: `Invalid threshold value: ${value}. Must be a positive number.`,
          severity: 'error',
        });
      }
    }
  }
  
  return errors;
}

function validateScenario(
  content: ScenarioYAML,
  file: string,
  environments: Map<string, EnvironmentYAML>
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Required fields
  const requiredFields = ['id', 'name', 'category', 'priority', 'service', 'trafficMix', 'slos'];
  for (const field of requiredFields) {
    if (!content[field]) {
      errors.push({
        file,
        field,
        message: `Required field "${field}" is missing`,
        severity: 'error',
      });
    }
  }
  
  // Validate category
  const validCategories = ['baseline', 'single-fault', 'compound-fault', 'data-integrity', 'deployment', 'e2e'];
  if (content.category && !validCategories.includes(content.category)) {
    errors.push({
      file,
      field: 'category',
      message: `Invalid category "${content.category}". Must be one of: ${validCategories.join(', ')}`,
      severity: 'warning',
    });
  }
  
  // Validate priority
  const validPriorities = ['P0', 'P1', 'P2', 'P3'];
  if (content.priority && !validPriorities.includes(content.priority)) {
    errors.push({
      file,
      field: 'priority',
      message: `Invalid priority "${content.priority}". Must be one of: ${validPriorities.join(', ')}`,
      severity: 'warning',
    });
  }
  
  // Validate service exists in at least one environment
  if (content.service) {
    let serviceFound = false;
    for (const [envName, env] of environments) {
      if (env.services && env.services[content.service]) {
        serviceFound = true;
        break;
      }
    }
    if (!serviceFound) {
      errors.push({
        file,
        field: 'service',
        message: `Service "${content.service}" not found in any environment config`,
        severity: 'warning',
      });
    }
  }
  
  // Validate trafficMix
  if (content.trafficMix) {
    errors.push(...validateTrafficMix(content.trafficMix, file));
  }
  
  // Validate SLOs
  if (content.slos) {
    errors.push(...validateSLOs(content.slos, file));
  }
  
  return errors;
}

function validateEnvironment(
  content: EnvironmentYAML,
  file: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!content.name) {
    errors.push({
      file,
      field: 'name',
      message: 'Required field "name" is missing',
      severity: 'error',
    });
  }
  
  if (!content.services || typeof content.services !== 'object') {
    errors.push({
      file,
      field: 'services',
      message: 'Required field "services" is missing or invalid',
      severity: 'error',
    });
  } else {
    for (const [service, url] of Object.entries(content.services)) {
      if (typeof url !== 'string') {
        errors.push({
          file,
          field: `services.${service}`,
          message: `Invalid URL type: ${typeof url}. Must be a string.`,
          severity: 'error',
        });
      } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        errors.push({
          file,
          field: `services.${service}`,
          message: `URL "${url}" doesn't start with http:// or https://`,
          severity: 'warning',
        });
      }
    }
  }
  
  return errors;
}

function validateProfile(
  content: ProfileYAML,
  file: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (!content.name) {
    errors.push({
      file,
      field: 'name',
      message: 'Required field "name" is missing',
      severity: 'error',
    });
  }
  
  if (content.thresholdMultiplier === undefined) {
    errors.push({
      file,
      field: 'thresholdMultiplier',
      message: 'Required field "thresholdMultiplier" is missing',
      severity: 'warning',
    });
  } else if (typeof content.thresholdMultiplier !== 'number' || content.thresholdMultiplier <= 0) {
    errors.push({
      file,
      field: 'thresholdMultiplier',
      message: `Invalid thresholdMultiplier: ${content.thresholdMultiplier}. Must be a positive number.`,
      severity: 'error',
    });
  }
  
  if (content.stages) {
    for (let i = 0; i < content.stages.length; i++) {
      const stage = content.stages[i];
      if (!stage.duration) {
        errors.push({
          file,
          field: `stages[${i}].duration`,
          message: 'Stage duration is required',
          severity: 'error',
        });
      }
      if (stage.target === undefined || typeof stage.target !== 'number') {
        errors.push({
          file,
          field: `stages[${i}].target`,
          message: 'Stage target is required and must be a number',
          severity: 'error',
        });
      }
    }
  }
  
  return errors;
}

// =============================================================================
// Main Validation
// =============================================================================

function findYAMLFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findYAMLFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function loadYAML(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.parse(content);
}

function validateAll(configDir: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    filesChecked: 0,
  };
  
  // Load environments first for cross-validation
  const environments = new Map<string, EnvironmentYAML>();
  const envDir = path.join(configDir, 'environments');
  const envFiles = findYAMLFiles(envDir);
  
  for (const file of envFiles) {
    try {
      const content = loadYAML(file) as EnvironmentYAML;
      environments.set(content.name || path.basename(file, '.yaml'), content);
      
      const errors = validateEnvironment(content, file);
      for (const error of errors) {
        if (error.severity === 'error') {
          result.errors.push(error);
          result.valid = false;
        } else {
          result.warnings.push(error);
        }
      }
      result.filesChecked++;
    } catch (e) {
      result.errors.push({
        file,
        field: '',
        message: `Failed to parse YAML: ${e}`,
        severity: 'error',
      });
      result.valid = false;
    }
  }
  
  // Validate profiles
  const profileDir = path.join(configDir, 'profiles');
  const profileFiles = findYAMLFiles(profileDir);
  
  for (const file of profileFiles) {
    try {
      const content = loadYAML(file) as ProfileYAML;
      const errors = validateProfile(content, file);
      for (const error of errors) {
        if (error.severity === 'error') {
          result.errors.push(error);
          result.valid = false;
        } else {
          result.warnings.push(error);
        }
      }
      result.filesChecked++;
    } catch (e) {
      result.errors.push({
        file,
        field: '',
        message: `Failed to parse YAML: ${e}`,
        severity: 'error',
      });
      result.valid = false;
    }
  }
  
  // Validate workloads (scenario configs)
  const scenarioDir = path.join(configDir, 'workloads');
  const scenarioFiles = findYAMLFiles(scenarioDir);
  
  for (const file of scenarioFiles) {
    // Skip README.md files
    if (file.endsWith('README.md')) continue;
    
    try {
      const content = loadYAML(file) as ScenarioYAML;
      const errors = validateScenario(content, file, environments);
      for (const error of errors) {
        if (error.severity === 'error') {
          result.errors.push(error);
          result.valid = false;
        } else {
          result.warnings.push(error);
        }
      }
      result.filesChecked++;
    } catch (e) {
      result.errors.push({
        file,
        field: '',
        message: `Failed to parse YAML: ${e}`,
        severity: 'error',
      });
      result.valid = false;
    }
  }
  
  return result;
}

// =============================================================================
// CLI
// =============================================================================

function printResult(result: ValidationResult): void {
  console.log('\n' + '═'.repeat(60));
  console.log('CONFIG VALIDATION RESULT');
  console.log('═'.repeat(60) + '\n');
  
  console.log(`Files checked: ${result.filesChecked}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  
  if (result.errors.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('ERRORS');
    console.log('─'.repeat(60));
    for (const error of result.errors) {
      console.log(`\n✗ ${error.file}`);
      console.log(`  Field: ${error.field || '(root)'}`);
      console.log(`  ${error.message}`);
      if (error.fixable) {
        console.log('  (fixable with --fix)');
      }
    }
  }
  
  if (result.warnings.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('WARNINGS');
    console.log('─'.repeat(60));
    for (const warning of result.warnings) {
      console.log(`\n⚠ ${warning.file}`);
      console.log(`  Field: ${warning.field || '(root)'}`);
      console.log(`  ${warning.message}`);
    }
  }
  
  console.log('\n' + '═'.repeat(60) + '\n');
}

// Main execution
const configDir = path.join(__dirname, '..', 'config');
const result = validateAll(configDir);
printResult(result);

process.exit(result.valid ? 0 : 1);
