import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

function hasNodeModules(root) {
  return existsSync(resolve(root, 'node_modules'));
}

function hasVendoredNodeModulesTgz(root) {
  return existsSync(resolve(root, 'node_modules.tgz'));
}

function extractVendoredNodeModules(root) {
  const tgz = resolve(root, 'node_modules.tgz');
  if (!existsSync(tgz)) return false;

  // Use system tar (available on macOS/Linux, and on Windows via bsdtar in modern builds).
  // If tar is not available, users can unzip using any archive tool.
  const tarCmd = platform() === 'win32' ? 'tar' : 'tar';
  run(tarCmd, ['-xzf', tgz], { cwd: root });
  return true;
}

function main() {
  const root = process.cwd();

  if (hasNodeModules(root)) {
    return;
  }

  if (!hasVendoredNodeModulesTgz(root)) {
    console.error('Offline install requires a vendored node_modules.tgz in the project root.');
    console.error('This bundle is incomplete: place node_modules.tgz next to package.json and retry.');
    process.exit(1);
  }

  console.log('Extracting vendored node_modules.tgz...');
  extractVendoredNodeModules(root);

  // Keep npm install flow predictable. We do NOT attempt to fetch anything.
  // npm will still run lifecycle scripts (including this one).
  console.log('Vendored node_modules extracted.');
}

main();
