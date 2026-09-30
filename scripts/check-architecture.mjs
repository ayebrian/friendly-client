import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';

const root = resolve('src');
const failures = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(file);
      continue;
    }
    if (!/\.tsx?$/.test(file) || /\.test\./.test(file)) continue;
    const source = await readFile(file, 'utf8');
    const from = relative(root, file).split('/');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const name = match[1];
      if (from[0] === 'domain' && !name.startsWith('.') && !name.startsWith('@/'))
        failures.push(`${file}: domain imports ${name}`);
      if (!name.startsWith('.') && !name.startsWith('@/')) continue;
      const to = relative(
        root,
        name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(file), name),
      ).split('/');
      if (
        ['features', 'shared', 'domain'].includes(from[0]) &&
        ['app', 'infrastructure'].includes(to[0])
      )
        failures.push(`${file}: forbidden import ${name}`);
      if (from[0] === 'features' && to[0] === 'features' && from[1] !== to[1])
        failures.push(`${file}: feature imports another feature ${name}`);
      if (from[0] === 'domain' && to[0] !== 'domain')
        failures.push(`${file}: domain imports outer layer ${name}`);
      if (from[0] === 'shared' && to[0] === 'features')
        failures.push(`${file}: shared imports feature ${name}`);
    }
    if (from[0] !== 'infrastructure' && /\bfetch\s*\(/.test(source))
      failures.push(`${file}: HTTP outside infrastructure`);
  }
}
await walk(root);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Architecture boundaries passed.');
