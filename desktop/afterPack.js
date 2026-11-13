const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const { appOutDir } = context;

  const nodeModulesSrc = path.join(__dirname, 'resources', 'streaming-server', 'node_modules');
  const nodeModulesDest = path.join(appOutDir, 'resources', 'streaming-server', 'node_modules');
  if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDest)) {
    fs.cpSync(nodeModulesSrc, nodeModulesDest, { recursive: true, dereference: true });
    console.log(`[afterPack] bundled node_modules -> ${nodeModulesDest}`);
  }
};
