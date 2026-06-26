// Logger ringan tanpa dependency — level dikendalikan via LOG_LEVEL.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET = '\x1b[0m';
const isTTY = process.stdout.isTTY; // strip ANSI codes jika output bukan terminal (PM2 logs)

function write(level, args) {
  if (LEVELS[level] > current) return;
  const ts = new Date().toISOString();
  const tag = isTTY ? `${COLORS[level]}[${level.toUpperCase()}]${RESET}` : `[${level.toUpperCase()}]`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`${ts} ${tag}`, ...args);
}

module.exports = {
  error: (...a) => write('error', a),
  warn: (...a) => write('warn', a),
  info: (...a) => write('info', a),
  debug: (...a) => write('debug', a),
};
