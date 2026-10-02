'use strict';

import { app, crashReporter } from 'electron';
import { startLogFile } from './log';
import { Application } from './application';

startLogFile();

// Log and carry on: a menu bar app that keeps the desk lit beats a modal error
// dialog. Native crashes cannot be caught here; crashReporter keeps a minidump
// of each, locally only, in the app's Crashpad folder.
process.on('uncaughtException', error => console.error('Uncaught exception:', error));
process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason));
crashReporter.start({ uploadToServer: false });

// `kill`, `killall` and launchd stop the app this way. Quit properly, so the
// devices are left red (see DeskLights.sleepNow) rather than mid-look.
['SIGTERM', 'SIGINT', 'SIGHUP'].forEach(signal => process.on(signal, () => app.quit()));

new Application(process.env.NODE_ENV == 'development');
