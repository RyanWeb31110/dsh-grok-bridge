import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageJson {
  version: string
}

const here = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(here, '..', 'package.json'), 'utf8')
const pkg = JSON.parse(raw) as PackageJson

/** Package version, read from package.json so the HTTP surface and the manifest match. */
export const VERSION: string = pkg.version
