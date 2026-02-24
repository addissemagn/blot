// Vercel serverless function entry point
// Sets NODE_PATH to allow bare module imports like require("blog") and require("config")
// This matches the NODE_PATH setup used in the original Blot deployment

// Override Node.js module resolution to include app directory
// This must happen before any requires that use bare imports
const Module = require('module');
const path = require('path');
const fs = require('fs');

// Set NODE_PATH to the app directory for module resolution
// In Vercel, __dirname will be /var/task/app
const appPath = __dirname;
process.env.NODE_PATH = appPath;

// Configure for serverless Vercel environment
// Use /tmp for temporary files (only writable directory in serverless)
if (!process.env.BLOT_TMP_DIRECTORY) {
  process.env.BLOT_TMP_DIRECTORY = '/tmp';
}

// Reinitialize module paths after setting NODE_PATH
// This is critical - Node.js needs to rebuild its module search paths
Module._initPaths();

// Store original methods
const originalResolveFilename = Module._resolveFilename;
const originalNodeModulePaths = Module._nodeModulePaths;

// Override _nodeModulePaths to always include app directory
Module._nodeModulePaths = function(from) {
  const paths = originalNodeModulePaths.call(this, from);
  // Always add app directory to the beginning
  if (paths.indexOf(appPath) === -1) {
    paths.unshift(appPath);
  }
  return paths;
};

// Override _resolveFilename to check app directory first for bare module names
Module._resolveFilename = function(request, parent, isMain, options) {
  // Skip override for relative/absolute paths
  if (request.startsWith('.') || path.isAbsolute(request)) {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  }
  
  // Skip core modules (check if builtinModules exists, for older Node versions)
  if (Module.builtinModules && Module.builtinModules.includes(request)) {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  }
  
  // For bare module names, check app directory first
  try {
    const appModulePath = path.join(appPath, request);
    
    // Check for .js file
    const jsPath = appModulePath + '.js';
    try {
      if (fs.existsSync(jsPath)) {
        return path.resolve(jsPath);
      }
    } catch (e) {
      // Continue to next check
    }
    
    // Check for directory with index.js
    try {
      if (fs.existsSync(appModulePath)) {
        const stat = fs.statSync(appModulePath);
        if (stat.isDirectory()) {
          const indexPath = path.join(appModulePath, 'index.js');
          if (fs.existsSync(indexPath)) {
            return path.resolve(indexPath);
          }
        } else if (stat.isFile()) {
          return path.resolve(appModulePath);
        }
      }
    } catch (e) {
      // Continue to fallback
    }
  } catch (e) {
    // If any error, fall through to default resolution
  }
  
  // Fall back to default resolution (which will use our modified _nodeModulePaths)
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Now require the server - all the bare imports will work
const server = require("./server");

// Export as a serverless function handler
module.exports = server;
