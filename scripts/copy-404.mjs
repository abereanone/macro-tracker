import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const indexPath = join(process.cwd(), 'dist', 'index.html');
const fallbackPath = join(process.cwd(), 'dist', '404.html');

if (existsSync(indexPath)) {
  copyFileSync(indexPath, fallbackPath);
}
