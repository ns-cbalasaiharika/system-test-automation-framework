const DEFAULT_ENV = "local";
const DEFAULT_PROFILE = "load";

/**
 * Simple YAML parser for config files.
 * Supports: objects, arrays, strings, numbers, booleans, and # comments.
 */
function parseYAML(content) {
  const lines = content.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  let currentArray = null;
  let currentArrayKey = null;
  let currentArrayIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Remove comments (but not inside quoted strings)
    const commentMatch = line.match(/^([^#"']*(?:"[^"]*"[^#"']*|'[^']*'[^#"']*)*)#.*$/);
    if (commentMatch) {
      line = commentMatch[1];
    }
    
    // Skip empty lines
    if (line.trim() === '') continue;
    
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    
    // Handle array items
    if (trimmed.startsWith('- ')) {
      const value = trimmed.substring(2).trim();
      
      // Find or create array
      if (currentArray === null || indent <= currentArrayIndent) {
        // This shouldn't happen in well-formed YAML
        continue;
      }
      
      // Check if it's an object in array or simple value
      if (value.includes(':')) {
        const obj = {};
        const [k, v] = splitFirst(value, ':');
        obj[k.trim()] = parseValue(v.trim());
        currentArray.push(obj);
      } else {
        currentArray.push(parseValue(value));
      }
      continue;
    }
    
    // Handle key: value pairs
    if (trimmed.includes(':')) {
      const [key, val] = splitFirst(trimmed, ':');
      const keyTrim = key.trim();
      const valTrim = val.trim();
      
      // Pop stack to find parent at correct indent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].obj;
      
      if (valTrim === '') {
        // Check if next line is array or nested object
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextLine.search(/\S/);
        
        if (nextTrimmed.startsWith('- ') && nextIndent > indent) {
          // It's an array
          parent[keyTrim] = [];
          currentArray = parent[keyTrim];
          currentArrayKey = keyTrim;
          currentArrayIndent = indent;
        } else {
          // It's a nested object
          parent[keyTrim] = {};
          stack.push({ obj: parent[keyTrim], indent: indent });
          currentArray = null;
        }
      } else {
        parent[keyTrim] = parseValue(valTrim);
        currentArray = null;
      }
    }
  }
  
  return result;
}

function splitFirst(str, sep) {
  const idx = str.indexOf(sep);
  if (idx === -1) return [str, ''];
  return [str.substring(0, idx), str.substring(idx + 1)];
}

function parseValue(val) {
  if (val === '') return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null') return null;
  
  // Handle quoted strings
  if ((val.startsWith('"') && val.endsWith('"')) || 
      (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  
  // Handle numbers
  if (!isNaN(val) && val !== '') {
    return val.includes('.') ? parseFloat(val) : parseInt(val, 10);
  }
  
  return val;
}

/**
 * Load config file - tries YAML first, falls back to JSON.
 */
function loadConfigFile(path) {
  // Try YAML first
  try {
    const yamlPath = path.replace(/\.json$/, '.yaml');
    const content = open(yamlPath);
    return parseYAML(content);
  } catch (e) {
    // Fall back to JSON
    try {
      const content = open(path);
      return JSON.parse(content);
    } catch (e2) {
      throw new Error(`Failed to load config: ${path} (tried .yaml and .json)`);
    }
  }
}

/**
 * Loads and merges configuration from environment, profile, and scenario files.
 * Supports both YAML (.yaml) and JSON (.json) formats.
 * Service-agnostic: works for any service (client-oppy, addonman, downloader, etc.)
 *
 * Precedence (lowest to highest): scenario → profile → environment → env vars → CLI flags.
 */
export function loadConfig(scenarioId) {
  const envName = __ENV.ENV || DEFAULT_ENV;
  const profileName = __ENV.PROFILE || DEFAULT_PROFILE;

  const envConfig = loadConfigFile(`../config/environments/${envName}.yaml`);
  const profileConfig = loadConfigFile(`../config/profiles/${profileName}.yaml`);
  const scenarioConfig = loadConfigFile(`../config/scenarios/${scenarioId}.yaml`);

  const serviceName = scenarioConfig.service || "client-oppy-configuration";
  const baseUrl = __ENV.BASE_URL || envConfig.services[serviceName];

  if (!baseUrl) {
    throw new Error(
      `Service "${serviceName}" not found in environment "${envName}". ` +
      `Available services: ${Object.keys(envConfig.services).join(", ")}`
    );
  }

  const defaults = envConfig.defaults || {};
  const tenantId = __ENV.TENANT_ID || defaults.tenantId || "";

  const defaultHeaders = defaults.headers || { "Content-Type": "application/json" };
  const scenarioHeaders = scenarioConfig.headers || {};
  const headers = Object.assign({}, defaultHeaders, scenarioHeaders);

  if (tenantId) {
    headers["x-netskope-tenantid"] = tenantId;
  }

  const thinkTime = scenarioConfig.thinkTime || defaults.thinkTime || { minMs: 100, maxMs: 300 };

  return {
    env: envConfig,
    profile: profileConfig,
    scenario: scenarioConfig,

    serviceName,
    baseUrl,
    tenantId,
    headers,

    thinkTime,
    thresholdMultiplier: profileConfig.thresholdMultiplier || 1.0,
    trafficMix: scenarioConfig.trafficMix,
    slos: scenarioConfig.slos,
  };
}

/**
 * Resolves the k6 executor options from profile and scenario configs.
 * Returns a complete k6 options.scenarios object.
 */
export function buildScenarioOptions(config) {
  const profile = config.profile;
  const scenario = config.scenario;

  if (scenario.customExecutor) {
    return {
      [scenario.id.toLowerCase().replace("-", "_")]: scenario.customExecutor,
    };
  }

  return {
    [scenario.id.toLowerCase().replace("-", "_")]: {
      executor: profile.executor || "ramping-vus",
      startVUs: profile.startVUs || 0,
      stages: profile.stages,
      gracefulRampDown: profile.gracefulRampDown || "30s",
    },
  };
}
