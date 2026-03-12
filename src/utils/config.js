/**
 * Application config — reads from ~/.cctimereporter/config.json.
 *
 * Config properties:
 *   importLog.enabled  — enable/disable import debug logging (default: false)
 *   importLog.clearOnStart — truncate log file at start of each import (default: false)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.cctimereporter');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  importLog: {
    enabled: false,
    clearOnStart: false,
  },
};

/**
 * Read config, merging with defaults. Returns defaults if file missing/invalid.
 */
export function readConfig() {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      importLog: {
        ...DEFAULTS.importLog,
        ...parsed.importLog,
      },
    };
  } catch (_) {
    return structuredClone(DEFAULTS);
  }
}

/**
 * Write config to disk, creating dir if needed.
 */
export function writeConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

export { CONFIG_DIR, CONFIG_PATH };
