import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));

const TRASH_FIXTURE = `import {rename,mkdir} from 'node:fs/promises'; import path from 'node:path'; import {randomUUID} from 'node:crypto'; export default async function trash(paths){const root=process.env.REDO_TEST_ROOT; if(!root)throw Error('Test trash has no root'); if(process.env.REDO_TEST_TRASH_FAIL)throw Error('Fixture trash failure'); await mkdir(path.join(root,'trash'),{recursive:true}); for(const file of [paths].flat()){if(!file.startsWith(root+'/'))throw Error('Refusing non-test trash');await rename(file,path.join(root,'trash',path.basename(file)+'-'+randomUUID()));}}`;

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/'))
    return {
      url: pathToFileURL(path.join(repo, `${specifier.slice(2)}.ts`)).href,
      shortCircuit: true,
    };
  if (specifier === 'trash')
    return {
      url: `data:text/javascript,${encodeURIComponent(TRASH_FIXTURE)}`,
      shortCircuit: true,
    };
  return next(specifier, context);
}
