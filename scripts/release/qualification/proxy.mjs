import { createServer, request } from 'node:http';
import { settings } from './settings.mjs';
const upstreamUrl=new URL(process.env.QUALIFICATION_UPSTREAM_URL);

// Local synthetic proxy: preserve forwarding history, append a known client.
// It adds no security response headers; postflight must observe the real app.
createServer((req,res)=>{
  const upstream=request({hostname:upstreamUrl.hostname,port:upstreamUrl.port,path:req.url,method:req.method,
    headers:{...req.headers,'x-forwarded-for':[req.headers['x-forwarded-for'],settings.clientAddress].filter(Boolean).join(', ')}},response=>{
    res.writeHead(response.statusCode,response.headers); response.pipe(res);
  });
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
}).listen(new URL(settings.siteOrigin).port,'0.0.0.0');
