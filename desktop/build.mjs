import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const root = path.resolve(desktopDir, '..');
const resourcesDir = path.join(desktopDir, 'resources');
const webOut = path.join(resourcesDir, 'web');
const streamSrc = path.join(root, 'streaming-server');
const streamOut = path.join(resourcesDir, 'streaming-server');
const ffmpegOutDir = path.join(resourcesDir, 'ffmpeg');

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
copyDir(streamSrc, streamOut, ['server.log', 'package-lock.json']);

// Bundle the static ffmpeg binary so subtitle-muxed downloads, MKV remux and
// audio transcoding work offline. main.js resolves it as FFMPEG_PATH.
try {
  const ffmpegStaticPath = require('ffmpeg-static');
  fs.mkdirSync(ffmpegOutDir, { recursive: true });
  const target = path.join(ffmpegOutDir, 'ffmpeg');
  fs.copyFileSync(ffmpegStaticPath, target);
  fs.chmodSync(target, 0o755);
  console.log(`  ffmpeg:           ${target} (${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
} catch (err) {
  console.warn(`  ffmpeg: SKIPPED (${err.message})`);
}

console.log('\nDesktop build complete.');
console.log(`  web:              ${webOut}`);
console.log(`  streaming-server: ${streamOut}`);
console.log('\nRun with: npm --prefix desktop start');
console.log('Package with: npm --prefix desktop run package');
