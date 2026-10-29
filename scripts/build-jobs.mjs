import { build } from 'esbuild';
// Bundle application dependencies too: Next standalone tracing omits worker-only imports.
// Prisma remains external so its generated client and native engine retain their paths.
await build({
  entryPoints: { worker: 'scripts/queue/worker.ts', beat: 'scripts/queue/beat.ts' },
  outdir: 'dist', bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  external: ['@prisma/client', 'sharp'],
  plugins: [{ name: 'server-boundary', setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
    builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
    // The runner image's standalone trace does not ship these Next modules, and
    // background jobs never have a request: callers already handle the throw.
    builder.onResolve({ filter: /^next\/(headers|navigation)$/ }, (args) => ({ path: args.path, namespace: 'no-request' }));
    builder.onLoad({ filter: /.*/, namespace: 'no-request' }, () => ({ loader: 'js', contents: [
      'const outside = (name) => () => { throw new Error(`${name} is unavailable outside a request.`); };',
      'module.exports = { headers: outside("headers"), cookies: outside("cookies"), draftMode: outside("draftMode"),',
      '  redirect: outside("redirect"), permanentRedirect: outside("permanentRedirect"), notFound: outside("notFound"),',
      '  forbidden: outside("forbidden"), unauthorized: outside("unauthorized") };',
    ].join('\n') }));
  } }],
  logLevel: 'info',
});
