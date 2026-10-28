import fs from 'node:fs';import ts from 'typescript';
// Strip the temporary visual markers before rebuilding the visual inventory.
for(const name of ['shared','customer-chat','agent-console','login','profile']){const f=`src/components/${name}.tsx`;fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/ data-visual="[^"]*"/g,''));}
let a=fs.readFileSync('artifacts/annotate-baseline.mjs','utf8').replace('strings.some(v=>v.includes(M[k]))','strings.slice(0,1).some(v=>v.includes(M[k]))');fs.writeFileSync('artifacts/annotate-baseline.mjs',a);
