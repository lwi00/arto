import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Cpu, ExternalLink, GitBranch, MessageSquare, Pause, Play, Radio, RotateCcw, Send, ShieldCheck, Square, TrainFront, TriangleAlert, X } from 'lucide-react';
import { LineMap } from './LineMap';
import type { Actor, TrainActor, FleetTrain, Message } from '../server/fleet';
import type { AgentState } from '../server/swarm';
import type { Scenario } from '../server/scenarios';
import type { Station } from '../server/network';

type TrainState = FleetTrain & { hardware: {status:string;values:Record<string,{value:number;observedAt:string}>}; sensors:{id:string;label:string;pin:number;value:number;observedAt:string}[];station:string };
type State = {trains:TrainState[];agents:Record<Actor,AgentState>;stations:Station[];paths:Record<'asnieres'|'saint_denis',string[]>;scenarios:Scenario[];messages:Message[];journal:{id:number;time:string;kind:string;title:string;detail:string;actor:Actor|'system'}[];paused:boolean;speed:number;simulatedSeconds:number;bulletin:{version:number;text:string;issuedAt:string};profile:{referenceFleet:number;trunkHeadwaySeconds:number;branchHeadwaySeconds:number;sourceYear:number}};
const names:Record<string,string>={pcc:'Control',system:'System',operator:'Operator',...Object.fromEntries(Array.from({length:66},(_,i)=>[i===0?'rame_a':i===1?'rame_b':`rame_${String(i+1).padStart(2,'0')}`,`Train ${String(i+1).padStart(2,'0')}`]))};
const time=(date:string)=>new Date(date).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

function Board({train}:{train:TrainState}){
  const motor=train.observedTraction===1;
  return <div className="board-layout"><svg viewBox="0 0 390 182" className="board-diagram" role="img" aria-label={`Onboard Arduino for ${train.label}. Traction D9 ${motor?'ON':'OFF'}`}>
    <rect x="62" y="15" width="241" height="151" rx="12" fill="#244d58"/>
    <rect x="58" y="31" width="25" height="32" rx="3" fill="#d1dde2"/><text x="71" y="78" textAnchor="middle" fill="#91b5be" fontSize="8">USB</text>
    <rect x="118" y="69" width="105" height="39" rx="3" fill="#16313a" stroke="#648892"/><text x="171" y="92" textAnchor="middle" fill="#b5ced4" fontSize="11">Local controller</text>
    <text x="100" y="46" fill="#d0e8ed" fontSize="13" fontWeight="600">ARDUINO UNO</text><text x="100" y="145" fill="#85aab5" fontSize="10">ARDUINO TOOL ORCHESTRATION</text>
    {train.sensors.map((sensor,i)=><g key={sensor.id}><rect x={90+i*27} y="20" width="16" height="15" rx="2" fill="#122d36"/><circle cx={98+i*27} cy="27.5" r="3" fill={sensor.value===1?'#a4d9b7':'#eea184'}/><text x={98+i*27} y="12" textAnchor="middle" fontSize="9" fill="#7a8e9b">{['Doors','Power','Alarm','Track','Radio','Route','System'][i]}</text></g>)}
    <circle cx="260" cy="86" r="7" fill={motor?'#b0e1bf':'#e2a18a'}/><text x="260" y="106" textAnchor="middle" fontSize="9" fill="#b2cbd2">Motor</text>
    <path d="M303 85h25" stroke={motor?'#80b993':'#cf927c'} strokeWidth="2"/><text x="331" y="81" fill="#8195a0" fontSize="9">MOTOR</text><text x="331" y="95" fill={motor?'#4c9375':'#b17159'} fontSize="10" fontWeight="600">{motor?'On':'Off'}</text>
  </svg><div className="sensor-grid">{train.sensors.map(sensor=><div className={`sensor ${sensor.value===0?'fault':''}`} key={sensor.id}><span>{sensor.label}</span><span className="sensor-value"><i className="dot"/>{sensor.value===1?(sensor.id==='door_closed'?'Closed':sensor.id==='power_ok'?'On':sensor.id==='radio_ok'?'Linked':'Clear'):(sensor.id==='door_closed'?'Check':sensor.id==='power_ok'?'Off':sensor.id==='radio_ok'?'Offline':'Hold')}</span></div>)}</div></div>;
}

export function App(){
  const [state,setState]=useState<State|null>(null),[token,setToken]=useState(''),[selected,setSelected]=useState<TrainActor>('rame_a');
  const [scenarioId,setScenarioId]=useState('doors'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connected,setConnected]=useState(true);
  const [tab,setTab]=useState<'messages'|'tools'>('messages'),[steerActor,setSteerActor]=useState<Actor>('rame_a'),[steer,setSteer]=useState('');
  useEffect(()=>{
    fetch('/api/bootstrap').then(r=>r.json()).then(r=>setToken(r.controlToken)).catch(()=>setError('Server unavailable'));
    const source=new EventSource('/api/events');source.onopen=()=>{fetch('/api/bootstrap').then(r=>r.json()).then(r=>setToken(r.controlToken)).catch(()=>{});};source.onmessage=e=>{const value=JSON.parse(e.data);if(value.agents){setState(value);setConnected(true);}};source.onerror=()=>setConnected(false);return()=>source.close();
  },[]);
  async function act(action:string,extra:Record<string,unknown>={}){
    setBusy(true);setError('');try{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','x-arto-control':token},body:JSON.stringify({action,train:selected,scenario:scenarioId,...extra})});const value=await response.json();if(!response.ok)throw new Error(value.error);setState(value);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(!state)return <div className="boot"><div className="arto-glyph">a</div><h1>Connecting to the fleet</h1><p>{error||'Initializing onboard Arduinos…'}</p></div>;
  const train=state.trains.find(t=>t.id===selected)!;
  const scenario=state.scenarios.find(s=>s.id===scenarioId)!;
  const active=train.incident&&train.incident.status!=='resolved';
  const running=Object.values(state.agents).some(a=>a.status==='running'||a.status==='queued');
  const reviewed=state.trains.filter(t=>state.bulletin.version>0&&state.agents[t.id].bulletinVersion===state.bulletin.version).length;
  const human=(text:string)=>text.replace(/rame_(a|b|\d+)/g,id=>names[id]??'train').replace(/\bdoor_closed\b/g,'doors').replace(/\bpccIntent=release\b/g,'cleared to leave').replace(/\btraction(?: observed| confirmed)?(?: at|=| to) [01]\b/gi,m=>m.includes('0')?'motor off':'motor enabled').replace(/episode \d+[,:]?\s*/gi,'').replace(/index \d+(?:\.\d+)?/gi,'the reported position').replace(/direction \+?1/gi,'northbound').replace(/direction -1/gi,'southbound');
  const actionName=(name:string)=>({describe_board:'Discover components',get_state:'Read device',read_component:'Read sensor',set_component:'Set output',get_events:'Read events',emergency_stop:'Stop motor',inspect_situation:'Read sensors',send_message:'Send message',set_traction:'Set motor',authorize_departure:'Clear to leave',publish_bulletin:'Notify the fleet',announce:'Update passengers'}[name]??name);
  const messages=state.messages.filter(m=>(m.kind!=='notice'||m.to===selected)&&(steerActor==='pcc'||m.to===selected||m.from===selected)).slice(-8).reverse();
  const tools=state.journal.filter(e=>['tool','action','hardware','sensor','clearance','error'].includes(e.kind)).slice(-10);
  const healthy=train.sensors.every(s=>s.value===1);
  const mapState={...state,sectors:[{id:'trunk' as const,permitted:true},{id:'asnieres' as const,permitted:true},{id:'saint_denis' as const,permitted:true}],incident:active?{...train.incident!,station:train.station,branch:train.branch}:null};
  return <div className="fleet-shell">
    <header className="fleet-header"><a className="fleet-brand" href="/">arto<span> / </span><span>Agents for Arduino</span></a><div className="fleet-header-right"><span><i className={`dot ${connected?'green':'amber'}`}/>{connected?'Simulation connected':'Connection lost'}</span><a href="https://github.com/lwi00/arto/blob/main/applications/metro/data/SOURCES.md" target="_blank" rel="noreferrer">Sources <ExternalLink size={14}/></a><a href="https://github.com/lwi00/arto" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14}/></a></div></header>
    <main className="fleet-main">
      <div className="fleet-heading"><div className="fleet-title"><img className="line-number" src="/assets/line13-logo.svg" alt="Line 13"/><div><h1>Line control</h1><p>{state.trains.length} trains · Two branches · One control centre</p></div></div><div className="train-picker"><span>TRAIN</span><select aria-label="Selected train" value={selected} onChange={e=>{setSelected(e.target.value as TrainActor);setSteerActor(e.target.value as Actor);}}>{state.trains.map(t=><option value={t.id} key={t.id}>{names[t.id]} · {t.branch==='asnieres'?'Asnières':'Saint-Denis'}</option>)}</select></div></div>
      <div className="four-zones">
        <section className="zone hardware-zone"><div className="zone-header"><div><Cpu size={18}/><h2>Onboard</h2></div><span className="zone-meta">{names[selected]} · Arduino</span></div>
          <Board train={train}/>
          <div className="hardware-summary"><span><i className={`dot ${healthy?'green':'amber'}`}/>{healthy?'Ready':'Check needed'}</span><span className="mono">Arduino connected</span></div>
          <div className="scenario-inject"><label htmlFor="scenario">Incident</label><div className="scenario-picker"><select id="scenario" value={scenarioId} disabled={!!active} onChange={e=>setScenarioId(e.target.value)}>{['Onboard','Infrastructure','Coordination','Recovery'].map(group=><optgroup label={group} key={group}>{state.scenarios.filter(s=>s.category===group).map(s=><option value={s.id} key={s.id}>{s.title}</option>)}</optgroup>)}</select><button className="inject-button" disabled={busy||!!active||!token} onClick={()=>act('incident')}><Play size={14}/> Start</button></div><p>{active?train.incident!.description:scenario.description}</p><div className="scenario-source"><span>{scenario.source?'Based on a sourced incident':'Simulated scenario'} · {state.scenarios.length} scenarios</span>{active&&<button disabled={busy} onClick={()=>act('resolve')}><Check size={13}/>{train.incident?.status==='recovering'?'Check again':'Resolve'}</button>}</div></div>
        </section>
        <section className="zone metro-zone"><div className="zone-header"><div><GitBranch size={18}/><h2>Network</h2><span className="zone-meta">32 stations</span></div></div>
          <div className="fleet-map-stage"><LineMap state={mapState} selected={null} select={()=>{}} selectedTrain={selected} selectTrain={id=>{if(state.trains.some(t=>t.id===id)){setSelected(id as TrainActor);setSteerActor(id as Actor);}}}/></div>
          <div className="selected-train-strip"><div><strong>{train.label}</strong><span>{train.station} · {train.direction===-1?'toward Châtillon':train.branch==='asnieres'?'toward Les Courtilles':'toward Saint-Denis'}</span></div><span className={`movement ${train.status==='held'?'held':''}`}><i className="dot"/>{train.status==='held'?'Held':train.status==='dwell'?'At station':'Running'}</span><button onClick={()=>act('pause')} disabled={busy}>{state.paused?<Play size={14}/>:<Pause size={14}/>}</button></div>
          <div className="fleet-rolling-stock"><img src="/assets/mf77-front.png" alt="MF77 leading car"/>{[0,1,2].map(i=><img src="/assets/mf77-car.png" alt="" key={i}/>)}<img src="/assets/mf77-back.png" alt=""/><span>MF 77</span></div>
          <div className="map-attribution">Plan Chabe01 / AlexBurn44 · CC BY-SA 4.0 · 2020 edition · Simulation speed ×{state.speed}</div>
        </section>
        <section className="zone agents-zone"><div className="zone-header"><div><MessageSquare size={18}/><h2>Agents</h2></div><div className="zone-tabs"><button className={tab==='messages'?'active':''} onClick={()=>setTab('messages')}>Messages</button><button className={tab==='tools'?'active':''} onClick={()=>setTab('tools')}>Actions</button></div></div>
          <div className="actors">{([selected,'pcc'] as Actor[]).map(id=><button key={id} className={`actor-chip ${steerActor===id?'selected':''}`} onClick={()=>setSteerActor(id)}><span className="actor-symbol">{id==='pcc'?<GitBranch size={15}/>:<TrainFront size={15}/>}</span><span><strong>{names[id]}</strong><small>{state.agents[id].status==='running'?'Acting…':state.agents[id].status==='error'?'Error':state.agents[id].status==='queued'?'Queued':'Standing by'}</small></span><i className={`dot ${state.agents[id].status==='error'?'amber':'green'}`}/></button>)}</div>
          <div className="fleet-review"><div><span><strong>{reviewed}/{state.trains.length}</strong> trains checked</span><button disabled={busy||running} onClick={()=>act('review')}>Check fleet</button></div><div className="agent-matrix">{state.trains.map((t,i)=><button key={t.id} className={state.agents[t.id].status==='error'?'error':state.agents[t.id].status==='running'?'acting':state.agents[t.id].status==='queued'?'queued':state.bulletin.version>0&&state.agents[t.id].bulletinVersion===state.bulletin.version?'reviewed':''} aria-label={names[t.id]+' · '+state.agents[t.id].status} title={state.agents[t.id].message} onClick={()=>{setSelected(t.id);setSteerActor(t.id);}}>{String(i+1).padStart(2,'0')}</button>)}</div></div>
          <div className="exchange-list" aria-live="polite">{tab==='messages'?(messages.length?messages.map(m=><div className={`exchange ${m.delivered?'':'undelivered'}`} key={m.id}><div className="exchange-meta"><strong>{names[m.from]} <ArrowRight size={11}/> {names[m.to]}</strong><span>{m.kind==='clearance'?'CLEARANCE':m.kind==='ack'?'CONFIRMED':m.kind==='request_clearance'?'READY TO LEAVE':m.kind==='report'?'REPORT':m.kind==='notice'?'BULLETIN':'INSTRUCTION'}</span><time>{time(m.at)}</time></div><p>{human(m.text)}</p>{!m.delivered&&<small>Not delivered · radio unavailable</small>}</div>):<div className="empty-exchanges"><MessageSquare size={23}/><p>Trains observe. Control coordinates.</p><span>Start an incident to see the agents act.</span></div>):(tools.length?tools.map(e=><div className="tool-event" key={e.id}><div><span>{names[e.actor]}</span><time>{time(e.time)}</time></div><strong>{actionName(e.title)}</strong><p>{e.kind==='tool'?'Agent action':human(e.detail)}</p></div>):<div className="empty-exchanges"><Cpu size={23}/><p>No tool calls yet.</p><span>Commands and their results will appear here.</span></div>)}</div>
          {Object.values(state.agents).some(a=>a.error)&&<div className="agent-failure">{Object.values(state.agents).filter(a=>a.error).map(a=><p key={a.id}>{names[a.id]} : {a.error}</p>)}</div>}
          <form className="steering" onSubmit={e=>{e.preventDefault();void act('steer',{actor:steerActor,text:steer});setSteer('');}}><label htmlFor="steer">To {names[steerActor]}</label><div><input id="steer" value={steer} onChange={e=>setSteer(e.target.value)} placeholder="Ask or instruct…" maxLength={1000}/><button disabled={busy||!steer.trim()} aria-label="Send"><Send size={16}/></button></div></form>
        </section>
        <section className="zone passengers-zone"><div className="zone-header"><div><Radio size={18}/><h2>Passengers</h2></div><span className="zone-meta">ONBOARD · {names[selected].toUpperCase()}</span></div>
          <div className="passenger-display"><div className="display-top"><img className="display-line" src="/assets/line13-logo.svg" alt="Line 13"/><span>{train.direction===-1?'Châtillon–Montrouge':train.branch==='asnieres'?'Les Courtilles':'Saint-Denis – Université'}</span><Radio size={17}/></div><p>{human(train.announcement)}</p><div className="display-bottom"><span>{train.status==='held'?'Train temporarily held':'Welcome aboard'}</span><span>MF 77</span></div></div>
          <div className="authority-path"><div className={healthy?'confirmed':''}><ShieldCheck size={16}/><span>Local checks</span><strong>{healthy?'Ready':'Hold'}</strong></div><div className={train.clearance&&train.pccIntent==='release'?'confirmed':''}><GitBranch size={16}/><span>Control</span><strong>{train.clearance&&train.pccIntent==='release'?'Clear to leave':'Waiting'}</strong></div><div className={train.observedTraction===1?'confirmed':''}><Cpu size={16}/><span>Motor</span><strong>{train.observedTraction===1?'Enabled':'Off'}</strong></div></div>
          <div className="decision-note"><span className="eyebrow">AGENT FOR {names[selected].toUpperCase()}</span><p>{human(state.agents[selected].message)}</p></div>
        </section>
      </div>
      <footer className="fleet-footer"><span>Arto · Metro simulation</span><div><button disabled={busy||running} onClick={()=>act('reset')}><RotateCcw size={13}/>Reset</button><button onClick={()=>act('stop')} disabled={busy}><Square size={12}/>Stop simulation</button></div></footer>
    </main>
    {error&&<div className="toast" role="alert"><TriangleAlert size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}
  </div>;
}
