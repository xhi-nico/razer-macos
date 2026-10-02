import fs from 'fs';
import path from 'path';
import util from 'util';
import { app } from 'electron';

// Past this size the log moves to main.old.log and starts again, so two files at most.
const MAX_BYTES = 1024 * 1024;

let logFile = null;

/**
 * Copies everything the main process logs to ~/Library/Logs/<app>/main.log.
 * The packaged app has no terminal, so this is the only record of what went wrong.
 */
export function startLogFile() {
  logFile = path.join(app.getPath('logs'), 'main.log');
  let size = 0;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    size = fs.statSync(logFile, { throwIfNoEntry: false })?.size ?? 0;
  } catch {
    // Logging must never stop the app.
  }

  const append = line => {
    try {
      if (size > MAX_BYTES) {
        fs.renameSync(logFile, logFile.replace(/\.log$/, '.old.log'));
        size = 0;
      }
      fs.appendFileSync(logFile, line);
      size += Buffer.byteLength(line);
    } catch {
      // As above.
    }
  };

  ['log', 'info', 'warn', 'error'].forEach(level => {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      append(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${util.format(...args)}\n`);
    };
  });
  return logFile;
}

export function getLogFile() {
  return logFile;
}
