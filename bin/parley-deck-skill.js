#!/usr/bin/env node

"use strict";

const installer = require("../lib/installer");

try {
  const result = installer.run(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr
  });
  if (result && result.exitCode) {
    process.exitCode = result.exitCode;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
