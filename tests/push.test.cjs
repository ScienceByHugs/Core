const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const ts = require('typescript')

function load(file, globals) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*$/mg, '')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(js, { exports, URL, Response, Request, atob, console, setTimeout, Capacitor: { isNativePlatform: () => false }, ...globals })
  return exports
}
const edgeFile = 'supabase/functions/_shared/web-push.ts'
const noopSql = Object.assign(async () => [], { begin: async callback => callback(noopSql) })

test('push endpoints reject SSRF, credentials, ports, and lookalike hosts', () => {
  const { validEndpoint } = load(edgeFile, {})
  for (const url of ['http://fcm.googleapis.com/a','https://localhost/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:444/a','https://push.apple.com.evil.test/a']) assert.equal(validEndpoint(url), false, url)
  for (const url of ['https://fcm.googleapis.com/fcm/send/abc','https://updates.push.services.mozilla.com/wpush/v2/abc','https://web.push.apple.com/abc','https://wns2-db5p.notify.windows.com/abc']) assert.equal(validEndpoint(url), true, url)
})

test('subscription API requires a real user and uses app_metadata for CORE access', async () => {
  const { handleSubscription } = load(edgeFile, {})
  const req = (input, token) => new Request('https://project.test/functions/v1/app-push', { method:'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(input) })
  const admin = { auth: { getUser: async () => ({ data: { user: { id:'u1', app_metadata:{}, user_metadata:{role:'owner'} } } }) } }
  assert.equal((await handleSubscription(req({ app:'core' }), admin, noopSql, 'ecosystem','app_push_subscriptions',{})).status, 401)
  assert.equal((await handleSubscription(req({ app:'core', action:'config' },'valid'), admin, noopSql,'ecosystem','app_push_subscriptions',{})).status,403)
  assert.equal((await handleSubscription(req({ app:'nexus', action:'subscribe', subscription:{endpoint:'https://localhost'} },'valid'), admin, noopSql,'ecosystem','app_push_subscriptions',{})).status,400)
})

test('status constrains both signed-in account and app in parameterized SQL', async () => {
  const calls=[]
  const sql=async (strings,...values)=>{calls.push({query:strings.join('?'),values});return []}
  const admin={auth:{getUser:async()=>({data:{user:{id:'u1'}}})}}
  const {handleSubscription}=load(edgeFile,{})
  const req=new Request('https://project.test/',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({app:'nexus',action:'status',subscription:{endpoint:'https://fcm.googleapis.com/abc'}})})
  const response=await handleSubscription(req,admin,sql,'ecosystem','app_push_subscriptions',{})
  assert.deepEqual(await response.json(),{enabled:false})
  assert.deepEqual(calls[0].values,['https://fcm.googleapis.com/abc','u1','nexus'])
  assert.match(calls[0].query,/user_id=.*app=/s)
})

test('expired device subscriptions are removed, transient failures are retryable', async () => {
  const removed=[]
  const admin={from:()=>({delete:()=>({eq:async(k,v)=>removed.push([k,v])})})}
  const sub={id:'device1',endpoint:'https://fcm.googleapis.com/a',p256dh:'p',auth:'a'}
  const gone=load(edgeFile,{webpush:{sendNotification:async()=>{throw {statusCode:410}}}})
  assert.equal(await gone.deliver(admin,'app_push_subscriptions',sub,{}),false)
  assert.deepEqual(removed,[['id','device1']])
  const transient=load(edgeFile,{webpush:{sendNotification:async()=>{throw {statusCode:503}}}})
  await assert.rejects(()=>transient.deliver(admin,'app_push_subscriptions',sub,{}))
  assert.equal(removed.length,1)
})

test('notification taps reject external URLs and focus the correct app window', async () => {
  const events={},calls=[]
  const appClient={url:'https://nexus.test/app/',navigate:async url=>calls.push(['navigate',url]),focus:()=>calls.push(['focus'])}
  const self={location:{origin:'https://nexus.test'},registration:{scope:'https://nexus.test/app/',showNotification:async()=>{}},clients:{matchAll:async()=>[{url:'https://nexus.test/other/'},appClient],openWindow:url=>calls.push(['open',url])},addEventListener:(name,cb)=>events[name]=cb}
  vm.runInNewContext(fs.readFileSync('public/push-sw.js','utf8'),{self,URL})
  let promise
  events.notificationclick({notification:{close(){},data:{url:'https://evil.test/'}},waitUntil:p=>promise=p})
  await promise
  assert.deepEqual(calls,[['navigate','https://nexus.test/app/'],['focus']])
})

test('permission is requested before async configuration; failed registration unsubscribes', async () => {
  const calls=[]
  const sub={endpoint:'https://fcm.googleapis.com/a',toJSON:()=>({endpoint:'https://fcm.googleapis.com/a'}),unsubscribe:async()=>calls.push('unsubscribe')}
  const reg={pushManager:{getSubscription:async()=>null,subscribe:async()=>{calls.push('subscribe');return sub}}}
  const supabase={functions:{invoke:async(_,input)=>{
    calls.push(input.body.action)
    if(input.body.action==='config')return {data:{publicKey:Buffer.alloc(65).toString('base64url')}}
    return {error:{message:'Database unavailable'}}
  }}}
  const notifications={permission:'default',requestPermission:async()=>{calls.push('permission');return 'granted'}}
  const {enablePush}=load('src/push.ts',{supabase,window:{PushManager:{},Notification:notifications},Notification:notifications,navigator:{serviceWorker:{ready:Promise.resolve(reg)}},setTimeout:()=>0})
  await assert.rejects(()=>enablePush(),/Database unavailable/)
  assert.deepEqual(calls,['permission','config','subscribe','subscribe','unsubscribe'])
})

test('disable keeps browser registration retryable if server deletion fails', async () => {
  let unsubscribed=false
  const sub={toJSON:()=>({endpoint:'https://fcm.googleapis.com/a'}),unsubscribe:async()=>{unsubscribed=true}}
  const supabase={functions:{invoke:async()=>({error:{message:'Delete failed'}})}}
  const notifications={permission:'granted'}
  const {disablePush}=load('src/push.ts',{supabase,window:{PushManager:{},Notification:notifications},Notification:notifications,navigator:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub}})}},setTimeout:()=>0})
  await assert.rejects(()=>disablePush(),/Delete failed/)
  assert.equal(unsubscribed,false)
})
