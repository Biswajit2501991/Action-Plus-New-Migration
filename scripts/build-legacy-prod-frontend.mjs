import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const indexPath = path.join(rootDir, 'index.html');
const leaveTrackerPath = path.join(rootDir, 'src', 'components', 'LeaveTrackerPageModule.jsx');
const registerApgModulesPath = path.join(rootDir, 'src', 'runtime', 'registerApgModules.js');
const outDir = path.join(rootDir, 'dist-legacy');
const outModulesDir = path.join(outDir, 'modules');
const outBundlePath = path.join(outDir, 'app.bundle.js');
const outLeaveTrackerPath = path.join(outModulesDir, 'LeaveTrackerPageModule.js');
const outRegisterApgModulesPath = path.join(outModulesDir, 'registerApgModules.js');
const outHtmlPath = path.join(outDir, 'index.html');

function extractInlineBabelScript(html) {
  const re = /<script\s+type="text\/babel"[^>]*>([\s\S]*?)<\/script>/i;
  const match = html.match(re);
  if (!match) {
    throw new Error('Could not locate inline <script type="text/babel"> block in index.html');
  }
  return { script: match[1], fullMatch: match[0] };
}

async function buildAppBundle(inlineScript) {
  const transformed = await esbuild.transform(inlineScript, {
    loader: 'jsx',
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
  });
  return transformed.code;
}

/** Map `import … from 'react'` to the global loaded by index.html. */
const reactGlobalPlugin = {
  name: 'react-global',
  setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react-global', namespace: 'react-global' }));
    build.onLoad({ filter: /.*/, namespace: 'react-global' }, () => ({
      contents: 'const React = window.React;\nexport default React;\n',
      loader: 'js',
    }));
  },
};

async function buildLeaveTrackerModule() {
  const result = await esbuild.build({
    entryPoints: [leaveTrackerPath],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    write: false,
    plugins: [reactGlobalPlugin],
  });
  return result.outputFiles[0].text;
}

/** Single-file ESM bundle — avoids stale /src/*.js partial cache at CDN/browser. */
async function buildRegisterApgModulesBundle() {
  const result = await esbuild.build({
    entryPoints: [registerApgModulesPath],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    write: false,
    plugins: [reactGlobalPlugin],
    loader: { '.js': 'jsx' },
  });
  return result.outputFiles[0].text;
}

function buildProdHtml(html, inlineFullMatch) {
  const buildTag = Date.now();
  const withoutBabelRuntime = html.replace(
    /[ \t]*<!-- Babel Standalone served locally for in-browser JSX compilation -->\s*[\r\n]+[ \t]*<script src="\.\/vendor\/babel\.min\.js"><\/script>\s*/i,
    '',
  );
  const withBundle = withoutBabelRuntime
    .replace(
      inlineFullMatch,
      `<script src="/dist-legacy/app.bundle.js?v=${buildTag}"></script>`,
    )
    .replace(
      /<script\s+type="module"\s+src="\.\/src\/runtime\/registerApgModules\.js"><\/script>/i,
      `<script>window.__APG_ESM_CACHE_BUST='${buildTag}';</script>\n  <script type="module" src="/dist-legacy/modules/registerApgModules.js?v=${buildTag}"></script>`,
    );
  // Root-absolute asset URLs so /index.html and /dist-legacy/index.html both work.
  return withBundle
    .replace(/src="\.\/dist-legacy\//g, 'src="/dist-legacy/')
    .replace(/src="\.\/src\//g, 'src="/src/')
    .replace(/src="\.\/app\.env\.js"/g, 'src="/app.env.js"')
    .replace(/src="\.\/vendor\//g, 'src="/vendor/')
    .replace(/"\.\/vendor\//g, '"/vendor/');
}

async function main() {
  const html = fs.readFileSync(indexPath, 'utf8');
  const { script: inlineScript, fullMatch } = extractInlineBabelScript(html);

  fs.mkdirSync(outModulesDir, { recursive: true });

  const [appBundle, leaveTrackerModule, registerApgModulesBundle] = await Promise.all([
    buildAppBundle(inlineScript),
    buildLeaveTrackerModule(),
    buildRegisterApgModulesBundle(),
  ]);

  fs.writeFileSync(outBundlePath, appBundle);
  fs.writeFileSync(outLeaveTrackerPath, leaveTrackerModule);
  fs.writeFileSync(outRegisterApgModulesPath, registerApgModulesBundle);

  const prodHtml = buildProdHtml(html, fullMatch);
  fs.writeFileSync(outHtmlPath, prodHtml);

  console.log(`[build-legacy-prod] wrote ${path.relative(rootDir, outHtmlPath)}`);
  console.log(`[build-legacy-prod] wrote ${path.relative(rootDir, outBundlePath)}`);
  console.log(`[build-legacy-prod] wrote ${path.relative(rootDir, outLeaveTrackerPath)}`);
  console.log(`[build-legacy-prod] wrote ${path.relative(rootDir, outRegisterApgModulesPath)}`);
}

main().catch((error) => {
  console.error('[build-legacy-prod] failed:', error.message);
  process.exit(1);
});
