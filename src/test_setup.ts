import {Console} from "console";

// Create a completely new console.
global.console = new Console(process.stdout, process.stderr, false);

// Then store it globally. Tests will restore it.
// @ts-ignore
global.originalConsole = console;

