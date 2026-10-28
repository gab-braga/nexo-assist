import fs from 'node:fs';
let s=fs.readFileSync('tests/tailwind-visual.mjs','utf8');
s=s.replace(".getByRole('button',{name:'Assumir atendimento'}).click()", ".getByRole('button',{name:'Assumir atendimento'}).click({force:true})");
s=s.replace("const phase = process.env.VISUAL_PHASE || 'before';", "const phase = 'after';\nconst legacyCss = await fs.readFile('artifacts/recovered-0.txt','utf8');");
const begin=s.indexOf(' await fs.writeFile(`artifacts/tailwind-${phase}/${name}.json`');const end=s.indexOf(' await page.close();',begin);
s=s.slice(0,begin)+`
 await fs.writeFile(\`artifacts/tailwind-after/\${name}.json\`,JSON.stringify(snapshot,null,2));
 await page.screenshot({path:\`artifacts/tailwind-after/\${name}.png\`,fullPage:true});
 await page.evaluate(css=>{
  const sheet=new CSSStyleSheet();sheet.replaceSync(css);
  const legacy=Array.from(sheet.cssRules).filter(r=>r.type===CSSRule.STYLE_RULE||r.type===CSSRule.MEDIA_RULE).map(r=>r.cssText).join('\\n');
  for(const el of document.querySelectorAll('[data-visual]')){
   const markers=el.getAttribute('data-visual').split(' ');const old=el.getAttribute('class')||'';
   let keep='';
   if(el.tagName==='BUTTON'&&old.includes('inline-flex items-center justify-center')){
    keep='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 ';
    keep+=old.includes('bg-primary ')?'bg-primary text-primary-foreground hover:bg-primary/90 ':old.includes('bg-red-50')?'bg-red-50 text-red-600 hover:bg-red-100 ':old.includes('border-border')?'border border-border bg-white hover:bg-muted shadow-xs ':'hover:bg-muted ';
    keep+=markers.includes('login-submit')?'h-11 px-5':markers.includes('send-circle')?'size-9':'h-9 px-3';
   }
   if(old.includes('min-h-28'))keep+=' min-h-28';
   if(markers.includes('ticket-fields')&&old.includes('grid-cols-4'))markers.push('four');
   el.setAttribute('class',markers.join(' ')+' '+keep);
  }
  document.body.removeAttribute('class');
  for(const el of document.querySelectorAll('[data-slot=status]')){const i=el.querySelector('i');const color=i?.className.match(/bg-\\[#(f5a400|0785ff|ff3449|b2b7bf|00bc7c)\\]/)?.[1];el.className='status status-'+({f5a400:'amber','0785ff':'blue',ff3449:'red',b2b7bf:'gray','00bc7c':'green'}[color]||'green')+(el.className.includes('rounded-[99px]')?' status-pill':'');if(i)i.removeAttribute('class');}
  for(const el of document.querySelectorAll('[data-slot=avatar]')){const c=el.className;const tone=c.includes('#f7e2d0')?'orange':c.includes('#e6dff8')?'purple':c.includes('#dcefe5')?'green':c.includes('#f8e0e7')?'pink':c.includes('#e5e8ed')?'gray':c.includes('#fcf0cd')?'yellow':'blue';el.className='avatar avatar-'+tone;el.querySelector('i')?.removeAttribute('class');}
  const chat=document.querySelector('[data-mode]');if(chat){chat.className='customer-chat chat-'+chat.dataset.mode;}
  const console=document.querySelector('[data-mobile-chat]');if(console)console.className='agent-console '+(console.dataset.details==='false'?'details-hidden ':'')+(console.dataset.mobileChat==='true'?'mobile-chat-open':'');
  const transcript=document.querySelector('[data-assumed]');if(transcript)transcript.className='agent-transcript '+(transcript.dataset.assumed==='true'?'assumed':'');
  for(const el of document.querySelectorAll('[data-from]'))el.className='agent-message '+el.dataset.from;
  for(const el of document.querySelectorAll('nav>a'))if(el.getAttribute('href')===location.pathname)el.classList.add('selected');
  const tabs=document.querySelectorAll('[data-visual~=conversation-tabs]>button');for(const el of tabs)if(el.textContent.trim().startsWith('Para você'))el.classList.add('active');
  for(const el of document.querySelectorAll('[data-visual~=conversation-item]'))if(el.textContent.includes('Ana Souza'))el.classList.add('active');
  for(const el of document.querySelectorAll('[data-visual~=choice-row] button'))if(el.textContent==='Só eu')el.classList.add('choice-selected');
  const list=document.querySelector('[data-visual~=ticket-list]');if(list){list.querySelector('button')?.classList.add('active');for(const el of list.querySelectorAll('button>span:first-child')){el.className='radio'+(el.parentElement===list.firstElementChild?' checked':'');}}
  for(const el of document.querySelectorAll('[data-visual~=other-ticket]>i')){const c=el.className;el.className=c.includes('#0785ff')?'dot-blue':c.includes('#00bc7c')?'dot-green':'dot-gray';}
  const style=document.createElement('style');style.textContent=legacy;document.head.appendChild(style);
 },legacyCss);
 await page.waitForTimeout(250);
 const before=await page.evaluate(properties=>Array.from(document.querySelectorAll('body,body *')).filter(el=>!['SCRIPT','STYLE','NEXTJS-PORTAL','next-route-announcer'].includes(el.tagName)&&!el.closest('nextjs-portal')).map(el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return {tag:el.tagName,text:el.childElementCount?null:el.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:Object.fromEntries(properties.map(k=>[k,s[k]]))};}),properties);
 await fs.writeFile(\`artifacts/tailwind-before/\${name}.json\`,JSON.stringify(before,null,2));
 await page.screenshot({path:\`artifacts/tailwind-before/\${name}.png\`,fullPage:true});
 const differences=[];for(let i=0;i<Math.max(before.length,snapshot.length);i++){const a=before[i],b=snapshot[i];if(!a||!b){differences.push({i,missing:true});continue;}const changes={};for(const key of Object.keys(a.style))if(a.style[key]!==b.style[key])changes[key]=[a.style[key],b.style[key]];if(JSON.stringify(a.rect)!==JSON.stringify(b.rect))changes.rect=[a.rect,b.rect];if(Object.keys(changes).length)differences.push({i,tag:b.tag,text:b.text,changes});}summary.push({name,differences});
`+s.slice(end);
fs.writeFileSync('tests/tailwind-visual.mjs',s);
