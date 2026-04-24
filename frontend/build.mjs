import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: 'public/app.js',
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  alias: {
    'react': 'preact/compat',
    'react-dom': 'preact/compat',
  },
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // Simple static file server for dev
  await ctx.serve({ servedir: 'public', port: 5174 });
  console.log('Dev server: http://localhost:5174');
} else {
  await esbuild.build(options);
}
