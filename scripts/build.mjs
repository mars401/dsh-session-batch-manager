/**
 * 构建脚本：一次产出宿主半与浏览器半。
 *
 * 两半的产物形态由 dsh 的加载机制决定，不能混用（与 dsh-project-hub 的构建同一套约束）：
 *
 * - **宿主半**（`lib/host/*.js`）：ESM，全打包、零运行时 external。容器里 dsh 发行版把
 *   `@deepseek-ai/*` 装在自己的 node_modules 下，profile 里被 link 进来的插件向上查找
 *   node_modules 到不了那一层；把 cordis 装成插件自己的依赖又会造出第二个副本，破坏
 *   Service/ctx 的身份。所以宿主半不 import 任何裸的 dsh 包名：schemastery 内联，
 *   dsh 的类型只在 `tsc --noEmit` 时用（`import type`）。也因此不用 `extends Service`，
 *   服务一律经 `ctx.get(name)` 结构化访问。
 *
 * - **浏览器半**（`lib/client.js`）：CJS，包在 `window.__ModuleLoader__.load({id, factory})`
 *   里；external 只能是浏览器模块表已 seed 的平台说明符
 *   （deepseek-harness/packages/client/web/src/platform.ts 的 PLATFORM_MODULES）。
 *
 * 用法：`node scripts/build.mjs [--watch]`
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { context, build } from 'esbuild'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const require = createRequire(import.meta.url)
const pkg = require(path.join(root, 'package.json'))
const watch = process.argv.includes('--watch')

/** 宿主半入口；键名即 `lib/` 下的输出路径，与 package.json 的 exports 一一对应。 */
const hostEntries = {
  'host/index': 'src/host/index.ts',
}

/** 浏览器模块表里已 seed 的说明符；除此之外的一切都必须打进 bundle。 */
const clientExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** 宿主半构建选项：ESM + 代码分割，共享代码落到 `lib/chunk-*.js`。 */
const hostOptions = {
  entryPoints: Object.fromEntries(
    Object.entries(hostEntries).map(([out, src]) => [out, path.join(root, src)]),
  ),
  outdir: path.join(root, 'lib'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  logLevel: 'warning',
  // 零 external：见文件头注释。
  external: [],
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: `/* ${pkg.name} host — bundled, zero runtime externals. */` },
}

/** 浏览器半构建选项：CJS + ModuleLoader 工厂封套。 */
const clientOptions = {
  entryPoints: [path.join(root, 'src/client/index.tsx')],
  outfile: path.join(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: true,
  logLevel: 'warning',
  external: clientExternals,
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {\n`
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: '\nreturn module.exports; } });' },
}

/** 浏览器半入口；尚未落地时跳过，而不是让构建失败。 */
const clientEntry = path.join(root, 'src/client/index.tsx')
const hasClient = existsSync(clientEntry)
if (!hasClient) {
  process.stdout.write(`note: ${clientEntry} 不存在，本轮只构建宿主半\n`)
}

if (watch) {
  const hostCtx = await context(hostOptions)
  await hostCtx.watch()
  if (hasClient) {
    const clientCtx = await context(clientOptions)
    await clientCtx.watch()
  }
  process.stdout.write(`watching ${pkg.name} → lib/（宿主半改动需重启 dsh；浏览器半由 client-modules 热替换）\n`)
} else {
  await build(hostOptions)
  if (hasClient) await build(clientOptions)
  process.stdout.write(`built ${pkg.name} → lib/host/*.js${hasClient ? ' + lib/client.js' : ''}\n`)
}
