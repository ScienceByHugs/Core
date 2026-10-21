// Live staging verification. Creates and archives one unpublished QA draft; never publishes it.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const [envPath, accountsPath] = process.argv.slice(2);
if (!envPath || !accountsPath) throw new Error('Usage: node scripts/verify-catalog-staging.mjs <staging-env-file> <synthetic-accounts-json>');
const env=Object.fromEntries(fs.readFileSync(envPath,'utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split(/=(.*)/s).slice(0,2)));
assert.equal(env.VITE_SUPABASE_URL,'https://evyssawhlarqqhgyswhz.supabase.co');
const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
const fixtures=JSON.parse(fs.readFileSync(accountsPath,'utf8')).accounts;
const sessions=[],checks=[];
const passed=name=>{checks.push(name);console.log('PASS '+name)};
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let admin, customer, productId;
const invoke=async(name,token,body={},origin='http://localhost:5174')=>{
 const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
};
try {
 for(const prefix of ['admin','customer-a','customer-b']) {
  const fixture=fixtures.find(f=>f.email.startsWith(prefix));assert.ok(fixture,'Missing synthetic identity');
  const c=client(),{data,error}=await c.auth.signInWithPassword(fixture);assert.ifError(error);
  assert.equal(data.user.app_metadata.environment,'staging');assert.equal(data.user.app_metadata.synthetic,true);
  sessions.push({client:c,token:data.session.access_token,user:data.user});
 }
 [admin,customer]=sessions;
 passed('Approved synthetic admin and two customers authenticated');
 for(const [token,status] of [[null,401],['invalid',401],[customer.token,403]]) {
  assert.equal((await invoke('core-catalog-control',token,{action:'save_product'})).status,status);
 }
 assert.equal((await invoke('core-catalog-control',admin.token,{},'https://core.sciencebyhugs.com')).status,403);
 passed('Anonymous, invalid-token, customer writes and production origins rejected');
 const read=await invoke('core-catalog',admin.token);assert.equal(read.status,200);assert.equal(read.body.success,true);
 const result=await invoke('core-catalog-control',admin.token,{action:'save_product',product:{name:'Unpublished QA draft',is_synthetic:true,sku:'QA-DRAFT-'+Date.now(),price:12.50,description:'Synthetic engineering fixture. Never publish.',quantity:'Package label only'}});
 assert.equal(result.status,200,JSON.stringify(result.body));productId=result.body.product.id;
 assert.equal(result.body.product.publication_status,'draft');assert.equal(result.body.product.active,false);
 for(const stockOnHand of [10,6]) {
  const update=await invoke('core-catalog-control',admin.token,{action:'adjust_inventory',productId,stockOnHand,lowStockThreshold:3,reason:'Synthetic QA draft inventory check'});
  assert.equal(update.status,200,JSON.stringify(update.body));assert.equal(update.body.inventory.available_to_sell,stockOnHand);
 }
 passed('Admin creates draft and persists audited numeric stock 10 → 6');
 const invalid=await invoke('core-catalog-control',admin.token,{action:'adjust_inventory',productId,stockOnHand:-1,reason:'Invalid QA adjustment'});assert.equal(invalid.status,400);
 const publish=await invoke('core-catalog-control',admin.token,{action:'set_publication',productId,status:'published'});assert.equal(publish.status,400);
 const history=await invoke('core-catalog-control',admin.token,{action:'history',productId});assert.equal(history.status,200);assert.ok(history.body.events.length>=3);
 passed('Negative inventory and incomplete publication rejected; audit history persisted');
 for(const c of [client(),customer.client,sessions[2].client]) {
  const {data,error}=await c.from('products').select('id,name').eq('id',productId);assert.ifError(error);assert.equal(data.length,0);
  const evidence=await c.from('products').select('verification_evidence');assert.ok(evidence.error);
  const write=await c.from('products').update({price:0}).eq('id',productId);assert.ok(write.error);
  const inventory=await c.from('product_inventory').update({stock_on_hand:100}).eq('product_id',productId);assert.ok(inventory.error);
 }
 passed('NEXUS read boundary hides draft; clients cannot read review evidence or write prices/stock');
 const deniedOrder=await customer.client.rpc('staging_submit_order',{p_items:[{product_id:productId,quantity:1,unit_price:12.50}],p_idempotency_key:crypto.randomUUID(),p_city:'Henderson'});assert.ok(deniedOrder.error);
 const sync=await invoke('core-catalog-sync',admin.token);assert.equal(sync.status,409);
 for(const c of sessions.slice(1)) {
  const profiles=await c.client.from('profiles').select('id,auth_user_id');assert.ifError(profiles.error);assert.equal(profiles.data.length,1);assert.equal(profiles.data[0].auth_user_id,c.user.id);
  const orders=await c.client.from('orders').select('id,customer_id');assert.ifError(orders.error);assert.ok(orders.data.every(o=>o.customer_id===profiles.data[0].id));
 }
 passed('Draft ordering rejected, vendor sync disabled, customer profile/order isolation holds');
 console.log(JSON.stringify({project:'evyssawhlarqqhgyswhz',checked_at:new Date().toISOString(),checks,passed:true,scope:'HTTP integration; no genuine product publication or payment'},null,2));
} finally {
 if(productId&&admin) {
  const archived=await invoke('core-catalog-control',admin.token,{action:'set_publication',productId,status:'archived'});
  assert.equal(archived.status,200,'QA draft archival failed');
 }
 for(const s of sessions) await s.client.auth.signOut({scope:'local'});
}
