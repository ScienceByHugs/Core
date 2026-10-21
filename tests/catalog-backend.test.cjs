const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('catalog external sync cannot forward service credentials or contact vendors',()=>{
 const source=read('supabase/functions/core-catalog-sync/index.ts');
 assert.doesNotMatch(source,/fetch\s*\(|bridgeKey|script\.google\.com/);
 assert.match(source,/status:409/);
});
test('catalog endpoint rejects mismatched projects and ordinary customers before service mutation',()=>{
 const source=read('supabase/functions/core-catalog-control/index.ts');
 assert.match(source,/SUPABASE_URL.*STAGING_REF/);
 assert.match(source,/auth\.getUser\(\)/);
 assert.match(source,/user\.app_metadata\.synthetic!==true/);
 assert.match(source,/\['owner','admin'\]\.includes\(user\.app_metadata\.role\)/);
 assert.ok(source.indexOf('auth.getUser()')<source.indexOf("admin.rpc('core_catalog_mutate'"));
});
