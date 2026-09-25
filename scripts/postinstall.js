const fs = require('fs');
const path = require('path');

const files = [
  'node_modules/@supabase/supabase-js/dist/index.mjs',
  'node_modules/@supabase/supabase-js/dist/index.js'
];

files.forEach(file => {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/process\.version/g, 'undefined');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[postinstall] Patched process.version in ${file}`);
  }
});
