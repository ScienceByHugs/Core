import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { isStagingProject, runtimeKeys } from '../_shared/staging.ts';
const origins = new Set(['http://localhost:5173','http://localhost:5174','capacitor://localhost','https://sbh-core-v2-staging.pages.dev','https://sbh-nexus-v2-staging.pages.dev']);
Deno.serve(async req => {
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin && origins.has(origin)?origin:'http://localhost:5174','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-api-version','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!isStagingProject())return json({error:'Staging project mismatch'},503);
 if(origin&&!origins.has(origin))return json({error:'Origin not approved for staging'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'POST required'},405);
 const authorization=req.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return json({error:'Authentication required'},401);
 try {
  const client=createClient(Deno.env.get('SUPABASE_URL')!,JSON.parse(runtimeKeys('publishable')).default,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return json({error:'Invalid session'},401);
  if(!user.email_confirmed_at||user.app_metadata.environment!=='staging'||user.app_metadata.synthetic!==true||!['owner','admin'].includes(user.app_metadata.role))return json({error:'Verified staging administrator required'},403);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'JSON object required'},400);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,JSON.parse(runtimeKeys('secret')).default,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body.action==='history') {
   if(typeof body.productId!=='string')return json({error:'Product ID required'},400);
   const {data,error}=await admin.from('core_audit_events').select('id,action,before_data,after_data,created_at,actor_user_id,metadata').eq('entity_type','product').eq('entity_id',body.productId).order('created_at',{ascending:false}).limit(100);
   if(error)return json({error:'Could not load history'},500);
   const inventory=await admin.from('inventory_events').select('id,actor_user_id,order_id,before_stock,after_stock,before_reserved,after_reserved,reason,created_at').eq('product_id',body.productId).order('created_at',{ascending:false}).limit(100);
   if(inventory.error)return json({error:'Could not load inventory history'},500);
   const events=[...(data||[]),...(inventory.data||[]).map(event=>({id:event.id,actor_user_id:event.actor_user_id,action:'inventory',created_at:event.created_at,before_data:{stock_on_hand:event.before_stock,reserved_quantity:event.before_reserved},after_data:{stock_on_hand:event.after_stock,reserved_quantity:event.after_reserved},metadata:{reason:event.reason,order_id:event.order_id}}))].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100);
   return json({success:true,events});
  }
  const result=await admin.rpc('core_catalog_mutate',{p_actor:user.id,p_body:body});
  if(result.error)return json({success:false,error:result.error.message},400);
  return json(result.data);
 }catch{return json({success:false,error:'Catalog service failed; retry or inspect logs'},500)}
});
