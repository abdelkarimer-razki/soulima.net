import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const root = path.resolve(desktopDir, '..');
const resourcesDir = path.join(desktopDir, 'resources');
const webOut = path.join(resourcesDir, 'web');
const streamSrc = path.join(root, 'streaming-server');
const streamOut = path.join(resourcesDir, 'streaming-server');

function run(cmd, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function copyDir(src, dest, exclude = []) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: (from) => !exclude.includes(path.basename(from)),
  });
}

run(
  `npx ng build --configuration production --output-path ${webOut} --base-href ./`
);
copyDir(streamSrc, streamOut, ['.env', 'server.log', 'package-lock.json']);

console.log('\nDesktop build complete.');
console.log(`  web:              ${webOut}`);
console.log(`  streaming-server: ${streamOut}`);
console.log('\nRun with: npm --prefix desktop start');
console.log('Package with: npm --prefix desktop run package');
