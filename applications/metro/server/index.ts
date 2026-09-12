import express from 'express';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, appendFile } from 'node:fs/promises';
import { z } from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Fleet, type Actor, type TrainActor } from './fleet.js';
import { Swarm } from './swarm.js';
import { createFleetServer } from './fleet-mcp.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 4313);
const master = process.env.ARTO_MCP_TOKEN || randomBytes(32).toString('hex');
const fleet = new Fleet({trainCount:Number(process.env.ARTO_TRAIN_COUNT??52)});
const actors: Actor[] = ['pcc',...fleet.trainIds];
const tokens = Object.fromEntries(actors.map(id => [id,createHmac('sha256',master).update(id).digest('hex')])) as Record<Actor,string>;
const controlToken = randomBytes(24).toString('hex');
const origin = `http://127.0.0.1:${port}`;
const app = express(); app.disable('x-powered-by');
app.use((req,res,next) => {
  if(req.headers.host && ![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.sendStatus(403);return;}
  if(req.headers.origin && ![origin,`http://localhost:${port}`].includes(req.headers.origin)){res.sendStatus(403);return;}
  next();
});
app.use(express.json({limit:'64kb'}));
const swarm = new Swarm(fleet, origin, tokens);
await fleet.start();
const logDir = fileURLToPath(new URL('../../../.arto/',import.meta.url)); await mkdir(logDir,{recursive:true});
fleet.on('log',event => {void appendFile(`${logDir}/fleet-events.jsonl`,JSON.stringify(event)+'\n').catch(()=>{});});
const snapshot = () => ({...fleet.snapshot(),agents:swarm.states});
app.get('/api/health',(_req,res)=>res.json({ok:[...fleet.devices.values()].every(d=>d.status==='ready'),boards:fleet.devices.size,harness:'codex-sdk',agents:actors}));
app.get('/api/state',(_req,res)=>res.json(snapshot()));
app.get('/api/bootstrap',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({controlToken});});
app.get('/api/events',(req,res)=>{
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');
  const push=()=>res.write(`data: ${JSON.stringify(snapshot())}\n\n`);push();const timer=setInterval(push,250);req.on('close',()=>clearInterval(timer));
});
const input=z.object({action:z.enum(['incident','resolve','reset','pause','agent','steer','stop','review']),train:z.enum(fleet.trainIds as [TrainActor,...TrainActor[]]).default('rame_a'),scenario:z.string().default('doors'),actor:z.enum(actors as [Actor,...Actor[]]).default('rame_a'),text:z.string().max(1000).optional()});
let busy=false;
app.post('/api/action',async(req,res)=>{
  if(req.headers['x-arto-control']!==controlToken){res.sendStatus(403);return;}
  if(busy){res.status(409).json({error:'An operator action is already running'});return;}busy=true;
  try {
    const body=input.parse(req.body);
    if(body.action==='incident')await fleet.inject(body.train,body.scenario);
    if(body.action==='resolve')await fleet.resolve(body.train);
    if(body.action==='reset'){swarm.reset();await fleet.reset();}
    if(body.action==='pause')fleet.paused=!fleet.paused;
    if(body.action==='review')void swarm.wake('pcc','Publish one whole-fleet review bulletin. Every train agent must inspect its own current conditions and report a concise English local assessment.');
    if(body.action==='agent')void swarm.wake(body.actor,'Inspect your current situation and take the necessary actions. Respond in English.');
    if(body.action==='steer'){
      if(!body.text?.trim())throw new Error('Empty instruction');
      fleet.log('operator',`Operator → ${body.actor}`,body.text);
      void swarm.wake(body.actor,`Operator instruction: ${body.text}. Inspect your situation before acting. Respond in English.`);
    }
    if(body.action==='stop'){swarm.stop();await fleet.stop();fleet.log('system','Operator stop','All traction outputs are zero');}
    res.json(snapshot());
  }catch(error){res.status(400).json({error:(error as Error).message});}finally{busy=false;}
});
app.post('/mcp/:actor',async(req,res)=>{
  const actor=req.params.actor as Actor;
  if(!actors.includes(actor)){res.sendStatus(404);return;}
  const supplied=Buffer.from(String(req.headers.authorization??'')),expected=Buffer.from(`Bearer ${tokens[actor]}`);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.sendStatus(401);return;}
  const server=createFleetServer(fleet,actor);const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void server.close();});
  try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch(error){if(!res.headersSent)res.status(500).json({error:(error as Error).message});}
});
app.all('/mcp/:actor',(_req,res)=>res.sendStatus(405));
if(process.env.ARTO_API_ONLY!=='1'){
  if(process.env.NODE_ENV==='production'){app.use(express.static(`${root}/dist`));app.get('/',(_req,res)=>res.sendFile(`${root}/dist/index.html`));}
  else{const {createServer}=await import('vite');const vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
}
let last=Date.now();const clock=setInterval(()=>{const now=Date.now();fleet.tick(Math.min((now-last)/1000,.5));last=now;},100);
const http=app.listen(port,'127.0.0.1',()=>console.log(`Arto fleet ready: ${origin}\n${fleet.trains.length} emulated Uno boards · ${fleet.trains.length+1} agents · scoped MCP endpoints`));
async function close(){clearInterval(clock);swarm.stop();await fleet.close();http.close();process.exit(0);}
process.once('SIGINT',close);process.once('SIGTERM',close);
