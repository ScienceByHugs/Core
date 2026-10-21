// Staging deliberately has no vendor bridge. Never transmit backend credentials
// to a legacy Apps Script endpoint or publish imported, unverified inventory.
import { serveStaging } from '../_shared/staging.ts';
serveStaging(async () => new Response(JSON.stringify({success:false,error:'External catalog import is disabled in staging. Create drafts in CORE and document verification before publication.'}),{status:409,headers:{'Content-Type':'application/json'}}));
