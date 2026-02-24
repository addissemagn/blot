// Wrapper script for Vercel build that sets up module resolution
// This must happen before any requires that use bare imports

const Module = require('module');
const path = require('path');

// Set NODE_PATH to the app directory for module resolution
const appPath = path.join(__dirname, '..', 'app');
process.env.NODE_PATH = appPath;

// Reinitialize module paths after setting NODE_PATH
Module._initPaths();

// Now require and run the build
const build = require('../app/documentation/build');

build()
  .then(() => {
    console.log('Build completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
