const fs = require('fs');
const path = require('path');

const VENDOR_MODULES = [
  'archiver-utils',
  'call-bind-apply-helpers',
  'side-channel-list',
  'side-channel-map',
  'side-channel-weakmap'
];

async function beforePack() {
  const rootDir = path.resolve(__dirname, '..');
  const sourceNodeModules = path.join(rootDir, 'node_modules');
  const vendorNodeModules = path.join(rootDir, 'src/vendor/node_modules');

  await fs.promises.rm(vendorNodeModules, { recursive: true, force: true });
  await fs.promises.mkdir(vendorNodeModules, { recursive: true });

  for (const moduleName of VENDOR_MODULES) {
    const source = path.join(sourceNodeModules, moduleName);
    const destination = path.join(vendorNodeModules, moduleName);
    await fs.promises.cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (filePath) => !filePath.includes(`${path.sep}.git${path.sep}`)
    });
  }
}

module.exports = beforePack;

if (require.main === module) {
  beforePack().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
