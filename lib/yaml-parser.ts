/**
 * Simple YAML Parser for K6 Config Files
 * 
 * A lightweight YAML parser that works in the k6 runtime environment.
 * Supports: objects, arrays, strings, numbers, booleans, null, and # comments.
 * 
 * Note: This is a simplified parser for config files. For complex YAML features
 * (anchors, multi-line strings, etc.), consider pre-processing with a full parser.
 */

interface YAMLParseContext {
  obj: Record<string, unknown>;
  indent: number;
}

/**
 * Parse a YAML string into a JavaScript object.
 * 
 * @param content - YAML content as a string
 * @returns Parsed object
 * 
 * @example
 * const config = parseYAML(`
 *   name: my-service
 *   port: 8080
 *   features:
 *     - auth
 *     - logging
 * `);
 */
export function parseYAML(content: string): Record<string, unknown> {
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  const stack: YAMLParseContext[] = [{ obj: result, indent: -1 }];
  let currentArray: unknown[] | null = null;
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
        continue;
      }
      
      // Check if it's an object in array or simple value
      if (value.includes(':')) {
        const obj: Record<string, unknown> = {};
        const [k, v] = splitFirst(value, ':');
        obj[k.trim()] = parseValue(v.trim());
        
        // Look ahead for continuation lines that are part of this object
        const arrayItemIndent = indent + 2; // Expected indent for continuation
        let j = i + 1;
        while (j < lines.length) {
          let nextLine = lines[j];
          // Remove comments
          const nextCommentMatch = nextLine.match(/^([^#"']*(?:"[^"]*"[^#"']*|'[^']*'[^#"']*)*)#.*$/);
          if (nextCommentMatch) {
            nextLine = nextCommentMatch[1];
          }
          const nextTrimmed = nextLine.trim();
          const nextIndent = nextLine.search(/\S/);
          
          // Skip empty lines
          if (nextTrimmed === '') {
            j++;
            continue;
          }
          
          // Check if this is a continuation of the array item object
          if (nextIndent >= arrayItemIndent && !nextTrimmed.startsWith('-') && nextTrimmed.includes(':')) {
            const [nk, nv] = splitFirst(nextTrimmed, ':');
            obj[nk.trim()] = parseValue(nv.trim());
            i = j; // Skip this line in main loop
            j++;
          } else {
            break;
          }
        }
        
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
          const arr: unknown[] = [];
          parent[keyTrim] = arr;
          currentArray = arr;
          currentArrayIndent = indent;
        } else {
          // It's a nested object
          const nested: Record<string, unknown> = {};
          parent[keyTrim] = nested;
          stack.push({ obj: nested, indent: indent });
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

/**
 * Split a string on the first occurrence of a separator.
 */
function splitFirst(str: string, sep: string): [string, string] {
  const idx = str.indexOf(sep);
  if (idx === -1) return [str, ''];
  return [str.substring(0, idx), str.substring(idx + 1)];
}

/**
 * Parse a YAML scalar value into its JavaScript equivalent.
 */
function parseValue(val: string): unknown {
  if (val === '') return '';
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;
  
  // Handle quoted strings
  if ((val.startsWith('"') && val.endsWith('"')) || 
      (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  
  // Handle numbers
  if (!isNaN(Number(val)) && val !== '') {
    return val.includes('.') ? parseFloat(val) : parseInt(val, 10);
  }
  
  return val;
}

/**
 * Type-safe wrapper to parse YAML with a specific type.
 * 
 * @param content - YAML content as a string
 * @returns Parsed object cast to the specified type
 * 
 * @example
 * interface Config { name: string; port: number; }
 * const config = parseYAMLAs<Config>(yamlContent);
 */
export function parseYAMLAs<T>(content: string): T {
  return parseYAML(content) as unknown as T;
}
