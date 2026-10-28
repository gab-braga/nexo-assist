import fs from 'node:fs';
const files=['src/components/shared.tsx','src/components/customer-chat.tsx','src/components/agent-console.tsx','src/components/login.tsx','src/components/profile.tsx','src/app/layout.tsx'];
const original=Object.fromEntries(files.map(f=>[f,fs.readFileSync(f,'utf8')]));fs.writeFileSync('artifacts/migration-source-backup.json',JSON.stringify(original));
