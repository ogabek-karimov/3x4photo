import { build } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/renderer/main.js'],
  bundle: true,
  format: 'esm',
  splitting: true,
  outdir: 'app/dist',
  target: 'chrome130',
  minify: !watch,
  sourcemap: watch,
  logLevel: 'info',
  // Node modullari brauzer to'plamiga kirmasin
  external: ['fs', 'path', 'os', 'crypto', 'worker_threads', 'perf_hooks', 'util', 'url'],
  define: { 'process.env.NODE_ENV': '"production"' }
};

if (watch) {
  const ctx = await (await import('esbuild')).context(options);
  await ctx.watch();
} else {
  await build(options);
}
