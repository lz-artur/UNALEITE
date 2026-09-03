import { spawn } from 'node:child_process';

const commands = [
  { name: 'backend', args: ['--prefix', 'backend', 'run', 'start:dev'] },
  { name: 'frontend', args: ['run', 'dev:frontend'] },
];

const children = commands.map(({ name, args }) => {
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (error) => {
    console.error(`Não foi possível iniciar ${name}:`, error.message);
  });
  return { name, child };
});

let stopping = false;
function stop(signal = 'SIGTERM', exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (!child.killed) child.kill(signal);
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
}

for (const { name, child } of children) {
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`${name} foi encerrado (${signal ?? `código ${code}`}).`);
      stop('SIGTERM', code ?? 1);
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
