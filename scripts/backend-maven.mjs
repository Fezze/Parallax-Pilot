import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const backendDir = path.join(repoRoot, 'backend')
const args = process.argv.slice(2)

if (args.length === 0) {
  console.error('Usage: node scripts/backend-maven.mjs <maven args...>')
  process.exit(1)
}

const mvnw = process.platform === 'win32'
  ? path.join(backendDir, 'mvnw.cmd')
  : path.join(backendDir, 'mvnw')
const mavenUserHome = path.join(backendDir, '.m2home')
const mavenRepo = path.join(backendDir, '.m2repo')
const mavenArgs = [`-Dmaven.repo.local=${mavenRepo}`, ...args]
const command = process.platform === 'win32' ? 'cmd' : mvnw
const commandArgs = process.platform === 'win32' ? ['/c', mvnw, ...mavenArgs] : mavenArgs
const result = spawnSync(
  command,
  commandArgs,
  {
    cwd: backendDir,
    env: {
      ...process.env,
      MAVEN_USER_HOME: mavenUserHome,
    },
    stdio: 'inherit',
  }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
