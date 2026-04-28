import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { sassPlugin } from 'esbuild-sass-plugin';

const isWatch = process.argv.includes('--watch');
const PUBLIC_DIR = 'public';
const OUT_DIR = 'dist';

const copyPublic = () => cp(PUBLIC_DIR, OUT_DIR, { recursive: true });

if (!isWatch) {
  await rm(OUT_DIR, { recursive: true, force: true });
}
await mkdir(OUT_DIR, { recursive: true });
await copyPublic();

const tailwindArgs = [
  'tailwindcss',
  '-i', 'src/index.css',
  '-o', `${OUT_DIR}/index.css`,
  ...(isWatch ? ['--watch'] : ['--minify']),
];
const tailwind = spawn('npx', tailwindArgs, { stdio: 'inherit' });
const cleanup = () => { if (!tailwind.killed) tailwind.kill(); };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: `${OUT_DIR}/app.js`,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  alias: {
    'react': 'preact/compat',
    'react-dom': 'preact/compat',
  },
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
  sourcemap: isWatch,
  minify: !isWatch,
  logLevel: 'info',
  plugins: [sassPlugin()],
};

if (isWatch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();

  let pending;
  watch(PUBLIC_DIR, { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      copyPublic().catch((err) => console.error('public copy failed:', err));
    }, 50);
  });

  await ctx.serve({ servedir: OUT_DIR, port: 5174 });
  console.log('Dev server: http://localhost:5174');
} else {
  await esbuild.build(options);
  await new Promise((resolve, reject) => {
    tailwind.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`tailwindcss exited with code ${code}`)),
    );
  });
}
