import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import i18n from '../i18n';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(root, 'src');
const languages = ['pt', 'en', 'es'];

function productionFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) productionFiles(full, files);
    else if (/\.jsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) files.push(full);
  }
  return files;
}

function usedStaticKeys() {
  const keys = new Set();
  for (const file of productionFiles(sourceRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.-]+)['"`]/g)) {
      if (match[1].startsWith('trips.')) keys.add(match[1]);
    }
  }
  return keys;
}

function valueAt(bundle, key) {
  return key
    .split('.')
    .reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), bundle);
}

// i18next resolves plurals through `_one`/`_other` suffixes, so a base key is
// considered translated when any plural form exists.
function hasTranslation(bundle, key) {
  return (
    valueAt(bundle, key) !== undefined ||
    valueAt(bundle, `${key}_one`) !== undefined ||
    valueAt(bundle, `${key}_other`) !== undefined
  );
}

describe('trips translations', () => {
  const used = usedStaticKeys();

  it('finds trips keys to validate', () => {
    expect(used.size).toBeGreaterThan(100);
  });

  it.each(languages)('defines every trips key used by the UI in %s', (language) => {
    const bundle = i18n.getResourceBundle(language, 'translation') || {};
    const missing = [...used].filter((key) => !hasTranslation(bundle, key)).sort();
    expect(missing).toEqual([]);
  });

  it.each(languages)('does not leave an empty translation in %s', (language) => {
    const bundle = i18n.getResourceBundle(language, 'translation') || {};
    const empty = [...used].filter((key) => {
      const value = valueAt(bundle, key);
      return typeof value === 'string' && value.trim() === '';
    });
    expect(empty.sort()).toEqual([]);
  });
});
