import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function read(path) {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

function assert(condition, detail) {
  if (!condition) throw new Error(`生产部署配置验收失败：${detail}`)
}

const rendered = spawnSync('docker', [
  'compose', '--profile', 'maintenance', '--env-file', 'deploy/config.env.example',
  'config', '--format', 'json',
], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: { ...process.env, WORD2HTML_DOMAIN: 'lesson.example.edu' },
})
if (rendered.error) throw new Error('无法执行 docker compose 配置校验。', { cause: rendered.error })
if (rendered.status !== 0) throw new Error(`docker compose 配置无效：${rendered.stderr.trim() || '未知错误'}`)

const compose = JSON.parse(rendered.stdout)
const app = compose.services?.app
const caddy = compose.services?.caddy
const maintenance = compose.services?.maintenance
const dockerfile = read('Dockerfile')
const dockerignore = read('.dockerignore')
const caddyfile = read('deploy/Caddyfile')
const secretInstructions = read('deploy/secrets/README.md')

assert(app && caddy && maintenance, '缺少 app、caddy 或 maintenance 服务。')
assert(app.user === 'node' && app.read_only === true && app.init === true, '应用容器没有使用非 root、只读根文件系统或 init。')
assert(app.cap_drop?.includes('ALL') && app.security_opt?.includes('no-new-privileges:true'), '应用容器权限收缩不完整。')
assert(app.healthcheck?.test?.join(' ').includes('/api/health'), '应用容器缺少真实健康检查。')
assert(!app.ports && app.expose?.includes('5173'), '应用端口不应直接发布到宿主机。')
assert(app.environment?.WORD2HTML_TRUST_PROXY === 'true', '内部 Caddy 部署没有启用可信代理客户端地址解析。')
assert(app.logging?.options?.['max-size'] && app.logging?.options?.['max-file'], '应用日志没有容量轮转限制。')

const environment = app.environment ?? {}
for (const name of [
  'WORD2HTML_MODEL_API_KEY_FILE',
  'WORD2HTML_ADMIN_TOKEN_FILE',
  'WORD2HTML_USER_SESSION_SECRET_FILE',
  'WORD2HTML_MODEL_USAGE_HASH_SECRET_FILE',
]) assert(typeof environment[name] === 'string' && environment[name].startsWith('/run/secrets/'), `缺少 ${name} 文件注入。`)
for (const name of [
  'WORD2HTML_MODEL_API_KEY',
  'WORD2HTML_ADMIN_TOKEN',
  'WORD2HTML_USER_SESSION_SECRET',
  'WORD2HTML_MODEL_USAGE_HASH_SECRET',
]) assert(environment[name] === undefined, `Compose 不应直接包含 ${name}。`)
assert(app.volumes?.some((volume) => volume.target === '/run/secrets' && volume.read_only === true), '密钥目录没有只读挂载。')
assert(app.volumes?.some((volume) => volume.target === '/var/lib/word2html-volume' && volume.type === 'volume'), '业务数据没有使用持久卷。')

assert(caddy.depends_on?.app?.condition === 'service_healthy', 'Caddy 没有等待应用健康。')
assert(caddy.ports?.some((port) => port.target === 443), 'Caddy 没有发布 HTTPS 端口。')
assert(caddy.logging?.options?.['max-size'] && caddy.logging?.options?.['max-file'], '代理日志没有容量轮转限制。')
assert(caddyfile.includes('reverse_proxy app:5173') && caddyfile.includes('format json'), 'Caddy 反向代理或 JSON 访问日志配置缺失。')

assert(maintenance.network_mode === 'none' && maintenance.read_only === true && maintenance.user === 'node', '维护容器隔离不完整。')
assert(maintenance.volumes?.some((volume) => volume.target === '/var/backups/word2html-volume'), '维护容器缺少独立备份卷。')
assert(maintenance.command?.join(' ').includes('backup:data'), '维护容器默认操作不是安全备份。')
assert(maintenance.command?.includes('/var/lib/word2html-volume/data'), '维护操作必须以卷内子目录为原子恢复目标。')

assert(/FROM node:22-bookworm-slim AS runtime/.test(dockerfile), '运行镜像 Node 主版本不明确。')
assert(/USER node/.test(dockerfile) && /CMD \["node", "server\/index[.]mjs", "--production"\]/.test(dockerfile), '镜像没有以非 root 直接启动生产服务。')
assert(!/^COPY\s+[.]\s+[.]\s*$/m.test(dockerfile), '运行镜像不应无选择地复制整个仓库。')
for (const fragment of ['server ./server', 'scripts ./scripts', 'src/schema ./src/schema', 'docs/third-party-ai-review-standard.md']) {
  assert(dockerfile.includes(fragment), `运行镜像缺少 ${fragment}。`)
}
for (const path of ['node_modules', '.env', '.word2html-data', '.word2html-backups', '.word2html-migrations']) {
  assert(dockerignore.split(/\r?\n/).includes(path) || dockerignore.includes(`${path}/`), `.dockerignore 缺少 ${path}。`)
}
assert(secretInstructions.includes('不要把真实值写入'), '密钥目录缺少安全说明。')
assert(dockerignore.includes('deploy/secrets/*'), 'Docker 构建上下文没有排除部署密钥。')

console.log(JSON.stringify({
  format: 'word2html.deployment-config-acceptance',
  formatVersion: '0.1',
  passed: true,
  services: Object.keys(compose.services),
  checks: {
    nonRootReadOnlyApp: true,
    fileSecretsOnly: true,
    internalAppPort: true,
    trustedProxyAddress: true,
    httpsReverseProxy: true,
    healthcheck: true,
    persistentData: true,
    atomicRestoreLayout: true,
    isolatedMaintenance: true,
    boundedJsonLogs: true,
  },
}, null, 2))
