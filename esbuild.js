const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  loader: { '.css': 'text' },
  sourcemap: true,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewCssOptions = {
  entryPoints: ['webview-ui/src/style.css'],
  bundle: false,
  outfile: 'media/main.css',
  minify: true,
  logLevel: 'info',
};

if (isWatch) {
  Promise.all([
    esbuild.context(extensionOptions).then(ctx => ctx.watch()),
    esbuild.context(webviewCssOptions).then(ctx => ctx.watch()),
  ]).then(() => console.log('Watching for changes...'));
} else {
  Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(webviewCssOptions),
  ]).catch(() => process.exit(1));
}
