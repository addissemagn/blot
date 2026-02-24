const config = require("config");
const { blot_directory } = config;
const { join } = require("path");
const fs = require("fs-extra");

// In serverless environments (like Vercel), use /tmp as it's the only writable directory
// Detect serverless by checking if we're in /var/task (Vercel)
const isServerless = process.cwd().startsWith('/var/task');
const git_data_directory = isServerless 
  ? '/tmp/git' 
  : join(blot_directory, "data/git");

fs.ensureDirSync(git_data_directory);

// consolidated reference to location of bareRepoDirectory in
// tests and code so we can move this in future painlessly:
// basically look for '/data'
module.exports = git_data_directory;
