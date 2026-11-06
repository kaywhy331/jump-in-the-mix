// Read-only diagnostics after a positively observed postflight failure. This
// never emits a receipt or changes an outcome; it retains the original checks.
import { postflight, assets, redirects } from '../jobs/postflight.mjs';
import * as reads from '../jobs/read-only.mjs';
const context=JSON.parse(Buffer.from(process.env.JITM_RELEASE_CONTEXT,'base64').toString());
let phase='source',lastAsset=null,status=null;
const io={...reads,
  command:async(...args)=>{
    phase='public-smoke';
    try {return await reads.command(...args);}
    catch(error) {
      try {
        const result=JSON.parse(error.stdout);
        console.log(JSON.stringify({diagnostic:phase,failed:result.checks.filter(c=>!c.ok).map(c=>({id:c.id,status:c.status,detail:c.detail}))}));
      } catch { console.log(JSON.stringify({diagnostic:phase,parseable:false})); }
      throw error;
    }
  },
  redirects:async(...args)=>{phase='redirects';return redirects(...args);},
  assets:async(context,origin)=>{
    phase='assets';
    return assets(context,origin,reads,async(...args)=>{
      lastAsset=new URL(args[0]).pathname;const response=await fetch(...args);status=response.status;return response;
    });
  },
};
try {await postflight(context,io);console.log(JSON.stringify({diagnostic:'postflight',result:'passed-on-diagnostic-read'}));}
catch {console.log(JSON.stringify({diagnostic:phase,lastAsset,status,result:'failed'}));process.exitCode=1;}
