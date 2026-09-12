import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createArtoServer, toolCall, toolResult } from 'arto-mcp';
import { z } from 'zod';
import type { Actor, Fleet, TrainActor } from './fleet.js';
export function createFleetServer(fleet:Fleet,actor:Actor){
  const server=actor==='pcc'?new McpServer({name:'arto-pcc',version:'0.3.0'}):createArtoServer(fleet.device(actor));
  const trains=z.enum(fleet.trainIds as [TrainActor,...TrainActor[]]);
  const local={destructiveHint:false,openWorldHint:false};
  server.registerTool('inspect_situation',{description:actor==='pcc'?'Read published train positions, reports and the current fleet bulletin. No direct access to private onboard sensors.':'Read MY actual Arduino inputs, traction output, PCC clearance, inbox and network bulletin.',annotations:{readOnlyHint:true,openWorldHint:false}},async()=>actor==='pcc'?toolResult(fleet.network()):toolCall(()=>fleet.inspect(actor)));
  server.registerTool('send_message',{description:'Deliver a local message to another agent mailbox without waiting for its reply. ACKs do not wake the recipient. A PCC instruction means hold; departure requires authorize_departure. No external communication.',inputSchema:{to:actor==='pcc'?trains:z.enum(['pcc']),kind:z.enum(['report','request_clearance','instruction','ack']),message:z.string().min(1).max(700)},annotations:{...local,idempotentHint:false}},async({to,kind,message})=>toolCall(async()=>fleet.send(actor,to,kind,message)));
  if(actor==='pcc'){
    server.registerTool('authorize_departure',{description:'Issue a time-bounded clearance for the current train fault episode. Wakes its agent, which must verify its local inputs before executing. Firmware retains veto.',inputSchema:{train:trains,reason:z.string().min(1).max(500)},annotations:local},async({train,reason})=>toolCall(async()=>fleet.authorize(train,reason)));
    server.registerTool('publish_bulletin',{description:'Publish ONE informational service bulletin and wake every train agent for its own local review. A bulletin is not a hold or clearance. Use once per new incident or explicit network review request.',inputSchema:{message:z.string().min(1).max(700)},annotations:local},async({message})=>toolResult(fleet.publishBulletin(message)));
  }else{
    server.registerTool('set_traction',{description:'Hold or depart MY simulated train through its actual firmware. Departure requires current PCC clearance and healthy inputs. Returns firmware and GPIO observations.',inputSchema:{action:z.enum(['hold','depart']),reason:z.string().min(1).max(500)},annotations:{...local,idempotentHint:true}},async({action,reason})=>toolCall(()=>fleet.traction(actor,action,reason)));
  }
  server.registerTool('announce',{description:actor==='pcc'?'Update the LOCAL passenger announcement across the fleet.':'Update MY train’s LOCAL passenger announcement. No external messages.',inputSchema:{message:z.string().min(1).max(500)},annotations:{...local,idempotentHint:true}},async({message})=>{for(const train of fleet.trains)if(actor==='pcc'||train.id===actor)train.announcement=message;fleet.log('announcement','Passenger information',message,actor);return toolResult({displayed:true});});
  return server;
}
