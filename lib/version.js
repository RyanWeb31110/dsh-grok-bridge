import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', 'package.json'), 'utf8');
const pkg = JSON.parse(raw);
/** Package version, read from package.json so the HTTP surface and the manifest match. */
export const VERSION = pkg.version;
//# sourceMappingURL=version.js.map