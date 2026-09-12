import { useRef } from 'react';
import geometry from '../data/line13-geometry.json';
import type { Station, Branch } from '../server/network';

type Props = { state: { stations: Station[]; trains: {id:string;branch:'asnieres'|'saint_denis';position:number;direction:number;status:string}[]; paths: Record<'asnieres'|'saint_denis', string[]>; incident: {station:string;branch:Branch;status:string}|null; sectors: { id: Branch; permitted: boolean }[] }; selected: string | null; select: (id: string) => void; selectedTrain?:string; selectTrain?:(id:string)=>void };
type Point = { x: number; y: number };
const points = geometry.byId as Record<string, Point>;
const curves = geometry.curvedEdges as Record<string, string>;

export function LineMap({ state, selected, select, selectedTrain, selectTrain }: Props) {
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const active = state.incident && ['active', 'updated'].includes(state.incident.status);
  const incidentStation = state.stations.find(s => s.name === state.incident?.station);
  return <svg className="real-network" viewBox="-20 -10 2330 950" aria-label="Plan réel de la ligne 13 avec les 32 stations et les trains de la maquette" role="img">
    <defs><filter id="marker-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".16"/></filter></defs>
    <image href="/assets/line13-horizontal.svg" x="0" y="0" width="2282" height="930"/>
    {geometry.sourcePaths.map((path, i) => {
      const sector = (['trunk', 'saint_denis', 'asnieres'] as Branch[])[i];
      const held = !state.sectors.find(s => s.id === sector)?.permitted;
      return held ? <path key={path.id} d={path.d} transform={path.transform} fill="none" stroke={active && state.incident?.branch === sector ? '#cf7859' : '#98a6af'} strokeWidth="9" strokeLinecap="round" opacity=".85"/> : null;
    })}
    {Object.entries(curves).map(([id, d]) => <path key={id} ref={node => { pathRefs.current[id] = node; }} d={d} fill="none" stroke="none"/>)}
    {state.stations.map(station => {
      const point = points[station.id]; if (!point) return null;
      const alert = active && incidentStation?.id === station.id;
      return <g key={station.id} className="station" role="button" tabIndex={0} aria-label={station.name} onClick={() => select(station.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(station.id); } }}>
        {(alert || selected === station.id) && <><circle cx={point.x} cy={point.y} r="34" fill={alert ? '#fff0e7' : '#e3f1f8'} stroke={alert ? '#c87153' : '#466b83'} strokeWidth="2"/><circle cx={point.x} cy={point.y} r="15" fill={alert ? '#cf7859' : '#25495f'} stroke="white" strokeWidth="4"/></>}
        <circle cx={point.x} cy={point.y} r="30" fill="transparent"/>
        <title>{station.name}</title>
      </g>;
    })}
    {state.trains.map(train => {
      const ids = state.paths[train.branch]; const i = Math.min(Math.floor(train.position), ids.length - 2); const fraction = Math.min(1, train.position - i);
      const a = points[ids[i]], b = points[ids[i + 1]]; const curve = pathRefs.current[`${ids[i]}:${ids[i + 1]}`];
      let p = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
      let angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (curve) {
        const length = curve.getTotalLength(); p = curve.getPointAtLength(length * fraction);
        const p2 = curve.getPointAtLength(Math.min(length, length * fraction + 1));
        if (fraction < .999) angle = Math.atan2(p2.y - p.y, p2.x - p.x);
      }
      const offset = train.direction * 16;
      const x = p.x - Math.sin(angle) * offset, y = p.y + Math.cos(angle) * offset;
      return <g className="train-marker" key={train.id} transform={`translate(${x} ${y}) rotate(${angle * 180 / Math.PI})`} filter="url(#marker-shadow)" role="button" tabIndex={0} aria-label={`Sélectionner ${train.id}`} onClick={()=>selectTrain?.(train.id)} onKeyDown={event=>{if(event.key==='Enter')selectTrain?.(train.id);}}>
        <rect x="-34" y="-26" width="68" height="52" rx="12" fill={selectedTrain===train.id?'#b6dbed':'transparent'} opacity=".4"/>
        <rect x="-20" y="-7" width="40" height="14" rx="5" fill={train.status === 'held' ? '#c27154' : '#203f54'} stroke="white" strokeWidth="2.5"/>
        <path d={train.direction > 0 ? 'M10 -3 L14 0 L10 3' : 'M-10 -3 L-14 0 L-10 3'} fill="none" stroke="#c5e8f6" strokeWidth="2"/>
        <title>{train.id} · {train.status === 'held' ? 'retenue' : 'en circulation'}</title>
      </g>;
    })}
  </svg>;
}
