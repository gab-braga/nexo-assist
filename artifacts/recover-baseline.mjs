import fs from 'node:fs';
const recovered=[];const scan=m=>{for(let i=0;i<(m.sources||[]).length;i++)if(m.sources[i].includes('globals.css')&&m.sourcesContent[i].includes('.login-story')) recovered.push(m.sourcesContent[i]);for(const z of m.sections||[])scan(z.map);};
for(const f of fs.readdirSync('.next/dev/static/chunks').filter(f=>f.endsWith('.css.map')))scan(JSON.parse(fs.readFileSync('.next/dev/static/chunks/'+f,'utf8')));
for(let i=0;i<recovered.length;i++){console.log(i,recovered[i].length,recovered[i].includes('--font-schibsted-grotesk'));fs.writeFileSync(`artifacts/recovered-${i}.txt`,recovered[i]);}
const script=fs.readFileSync('artifacts/migrate-tailwind.mjs','utf8');const body=script.slice(script.indexOf('const M='),script.indexOf('const files='));const M=Function(body+'return M;')();fs.writeFileSync('artifacts/utility-map.json',JSON.stringify(M,null,2));
