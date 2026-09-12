import { EventEmitter } from 'node:events';
import { ArtoDevice, AvrTransport } from 'arto-mcp';
import { stations, paths, edges, type Branch } from './network.js';
import { sensors, scenarios, trainManifest, type Scenario, type SensorId } from './scenarios.js';

export type TrainActor = `rame_${string}`;
export type Actor = 'pcc' | TrainActor;
export type MessageKind = 'report' | 'request_clearance' | 'instruction' | 'clearance' | 'ack' | 'notice';
export type Message = { id: number; at: string; from: Actor | 'operator'; to: Actor; kind: MessageKind; text: string; episode: number; delivered: boolean };
type Clearance = { id: string; episode: number; issuedAt: string; expiresAt: number };
export type FleetTrain = {
  id: TrainActor; label: string; model: 'MF77'; branch: 'asnieres' | 'saint_denis'; position: number; direction: 1 | -1;
  status: 'running' | 'held' | 'dwell'; dwell: number; delay: number;
  episode: number; clearance: Clearance | null; pccIntent: 'hold' | 'release';
  incident: { scenarioId: string; title: string; description: string; status: 'active' | 'recovering' | 'resolved'; source?: string; step: number } | null;
  announcement: string; observedTraction: number;
};
export class Fleet extends EventEmitter {
  readonly devices = new Map<TrainActor, ArtoDevice>();
  readonly trains: FleetTrain[] = [];
  readonly profile = { referenceFleet: 52, trunkHeadwaySeconds: 95, branchHeadwaySeconds: 190, sourceYear: 2018, source: 'RATP / Île-de-France Mobilités line committee', observedLive: false };
  bulletin = { version: 0, text: '', issuedAt: '' };
  readonly clockScale: number;
  get trainIds(): TrainActor[] { return this.trains.map(t => t.id); }
  messages: Message[] = [];
  journal: { id: number; time: string; kind: string; title: string; detail: string; actor: Actor | 'system' }[] = [];
  reports: Partial<Record<TrainActor, { at: string; text: string; episode: number; kind: MessageKind }>> = {};
  paused = false; speed = 8; simulatedSeconds = 0; delivered = 0; sequence = 0;
  constructor(options: { trainCount?: number; clockScale?: number } = {}) {
    super();
    const count = options.trainCount ?? 52;
    if (!Number.isInteger(count) || count < 2 || count > 66) throw new Error('trainCount must be between 2 and 66');
    this.clockScale = options.clockScale ?? (count > 8 ? 0.08 : 1);
    const asnieresCount = count === 2 ? 2 : Math.round(count * 25 / 52);
    for (let i = 0; i < count; i++) {
      const id: TrainActor = i === 0 ? 'rame_a' : i === 1 ? 'rame_b' : `rame_${String(i + 1).padStart(2, '0')}`;
      const branch = i < asnieresCount ? 'asnieres' : 'saint_denis';
      this.trains.push({ id, label: `Train ${String(i + 1).padStart(2, '0')}`, model: 'MF77', branch, position:0, direction:1, status:'running', dwell:0, delay:0, episode:0, clearance:null, pccIntent:'release', incident:null, announcement:'Welcome aboard. Service is running normally.', observedTraction:0 });
    }
    for (const train of this.trains) {
      const transport = new AvrTransport(undefined, { clockScale: this.clockScale });
      const device = new ArtoDevice(trainManifest(train.id, train.label), transport, { beforeWrite: (component, value) => {
        if (component.id === 'traction' && value === 1) {
          const clearance = train.clearance;
          if (!clearance || clearance.episode !== train.episode || clearance.expiresAt < Date.now() || train.pccIntent !== 'release') throw new Error('PCC clearance is missing, expired or revoked for this episode');
        }
      } });
      transport.on('gpio', (event: { pin: number; value: number }) => { if (event.pin === 9) { train.observedTraction = event.value; this.emit('change'); } });
      device.on('event', event => {
        if (event.type === 'interlock') this.log('hardware', 'Local controller cut traction', `${train.label} · firmware interlock`, train.id);
        if (event.type === 'fault') { train.observedTraction = 0; train.clearance = null; this.log('error', 'Arduino link unavailable', String(event.data.message), train.id); }
      });
      this.devices.set(train.id, device);
    }
  }
  train(id: string) { const train = this.trains.find(t => t.id === id); if (!train) throw new Error('Unknown train'); return train; }
  device(id: TrainActor) { return this.devices.get(id)!; }
  log(kind: string, title: string, detail = '', actor: Actor | 'system' = 'system') {
    const event = { id: ++this.sequence, time: new Date().toISOString(), kind, title, detail, actor };
    this.journal.push(event); if (this.journal.length > 180) this.journal.shift(); this.emit('log', event); this.emit('change');
  }
  private async eachBoard(action: (train: FleetTrain, index: number) => Promise<void>) {
    for (let i = 0; i < this.trains.length; i += 6) await Promise.all(this.trains.slice(i, i + 6).map((train, offset) => action(train, i + offset)));
  }
  async start() { await this.eachBoard(async train => { await this.device(train.id).connect(); }); await this.reset(); }
  private seed(train: FleetTrain, index: number) {
    if (this.trains.length === 2) { train.position = index === 0 ? 20.2 : 21.8; train.direction = -1; return; }
    const group = this.trains.filter(t => t.branch === train.branch);
    const order = group.findIndex(t => t.id === train.id), length = paths[train.branch].length - 1;
    // Both directions count. Per-branch cycle spacing avoids counting the shared trunk twice.
    const phase = ((order + 0.25) / group.length * 2 * length + (train.branch === 'saint_denis' ? 0.55 : 0)) % (2 * length);
    train.direction = phase < length ? 1 : -1;
    train.position = phase < length ? phase : 2 * length - phase;
  }
  async inspect(id: TrainActor) {
    const device = this.device(id), train = this.train(id);
    for (const sensor of sensors) await device.read(sensor.id);
    await device.read('traction');
    return { train: { ...train }, device: device.snapshot(), sensors: sensors.map(s => ({ ...s, ...device.values[s.id] })),
      inbox: this.messages.filter(m => m.to === id && m.delivered).slice(-8), bulletin: this.bulletin,
      constraints: 'An input at 0 blocks traction in firmware. Healthy inputs alone do not permit departure: current PCC clearance is required. A PCC hold instruction stays in force until clearance; acknowledge the hold and wait. A recovering local incident can be reported with a clearance request.' };
  }
  async reset() {
    this.paused = true;
    await this.eachBoard(async (train, index) => {
      const device = this.device(train.id); await device.emergencyStop();
      for (const sensor of sensors) device.transport.setInput!(sensor.pin, true);
      train.episode++; train.incident = null; train.pccIntent = 'release';
      train.clearance = { id: `initial-${train.episode}`, episode: train.episode, issuedAt: new Date().toISOString(), expiresAt: Date.now() + 86400000 };
      this.seed(train, index); train.dwell = 0; train.delay = 0;
      for (const sensor of sensors) await device.read(sensor.id);
      await device.write('traction', 1); await device.write('indicator', 1);
      train.announcement = 'Welcome aboard. Service is running normally on Line 13.';
    });
    this.bulletin = { version:0, text:'', issuedAt:'' };
    this.messages = []; this.journal = []; this.reports = {}; this.simulatedSeconds = 0; this.delivered = 0; this.paused = false;
    this.log('system', 'Normal service', `${this.trains.length} instrumented trains · ${this.trains.length} train agents · one PCC agent`);
  }
  async inject(id: TrainActor, scenarioId: string) {
    const train = this.train(id), device = this.device(id);
    if (train.incident && train.incident.status !== 'resolved') throw new Error('Resolve the current scenario before injecting another');
    const scenario = scenarios.find(s => s.id === scenarioId); if (!scenario) throw new Error('Unknown scenario');
    train.episode++; train.clearance = null; train.pccIntent = 'hold';
    train.incident = { scenarioId, title: scenario.title, description: scenario.description, status: 'active', source: scenario.source, step: 0 };
    train.announcement = 'A local fault has been detected. This train is held while the situation is assessed.';
    for (const name of scenario.faults) { const sensor = sensors.find(s => s.id === name)!; device.transport.setInput!(sensor.pin, false); }
    for (const name of scenario.faults) await device.read(name);
    await device.read('traction');
    this.log('sensor', scenario.title, `${train.label} · injected Arduino input(s) : ${scenario.faults.join(', ')}`, id);
    this.emit('wake', id, 'Your local sensors changed. Inspect your train, diagnose and decide what to do. Respond only in English.');
  }
  async resolve(id: TrainActor) {
    const train = this.train(id), device = this.device(id);
    if (!train.incident || train.incident.status === 'resolved') throw new Error('No incident to resolve');
    const scenario = scenarios.find(s => s.id === train.incident!.scenarioId)!;
    const partial = scenario.partial && train.incident.step === 0;
    const restored = partial ? scenario.faults.slice(0, 1) : scenario.faults;
    for (const name of restored) device.transport.setInput!(sensors.find(s => s.id === name)!.pin, true);
    train.incident.step++;
    for (const sensor of sensors) await device.read(sensor.id);
    const healthy = sensors.every(s => device.values[s.id]?.value === 1);
    if (healthy) train.incident.status = 'recovering';
    this.log('sensor', partial ? 'Partial restoration sur la rame' : 'Local conditions restored', `${train.label} · departure requires PCC clearance`, id);
    this.emit('wake', id, 'Field intervention changed your Arduino inputs. Verify their state and request PCC departure clearance only if local conditions are healthy. Respond in English.');
  }
  radioAvailable(id: Actor) { return id === 'pcc' || this.device(id).values.radio_ok?.value === 1; }
  send(from: Actor, to: Actor, kind: MessageKind, text: string) {
    if (from === to || (from !== 'pcc' && to !== 'pcc')) throw new Error('Train agents communicate with PCC');
    if (from !== 'pcc' && ['instruction', 'clearance'].includes(kind)) throw new Error('Only PCC can issue instructions');
    if (kind === 'clearance') throw new Error('Use authorize_departure for a verifiable clearance');
    const train = this.train(from === 'pcc' ? to : from);
    const delivered = this.radioAvailable(from) && this.radioAvailable(to);
    const message: Message = { id: ++this.sequence, at: new Date().toISOString(), from, to, kind, text, episode: train.episode, delivered };
    this.messages.push(message); if (this.messages.length > 500) this.messages.shift();
    if (!delivered) { this.log('message', 'Message not delivered', `${from} → ${to} : radio unavailable`, from); return { delivered: false, messageId: message.id, reason: 'radio_unavailable' }; }
    if (from !== 'pcc') this.reports[from] = { at: message.at, text, episode: train.episode, kind };
    if (from === 'pcc' && kind === 'instruction') { train.pccIntent = 'hold'; train.clearance = null; }
    this.log('message', `${from} → ${to}`, text, from);
    if (kind !== 'ack') this.emit('wake', to, `Message ${kind} de ${from}. Inspect your state and inbox before acting. Respond in English.`);
    return { delivered: true, messageId: message.id };
  }
  publishBulletin(text: string) {
    this.bulletin = { version: this.bulletin.version + 1, text, issuedAt: new Date().toISOString() };
    for (const train of this.trains) {
      const delivered = this.radioAvailable(train.id);
      this.messages.push({ id: ++this.sequence, at: this.bulletin.issuedAt, from:'pcc', to:train.id, kind:'notice', text, episode:train.episode, delivered });
      if (delivered) this.emit('wake', train.id, `PCC bulletin #${this.bulletin.version}: ${text}. Inspect your local conditions and review the notice. Continue normal service if unaffected; do not stop or request clearance without a reason. Finish with a concise English local assessment.`);
    }
    this.log('bulletin', `PCC bulletin to ${this.trains.length} train agents`, text, 'pcc');
    return { version:this.bulletin.version, recipients:this.trains.length };
  }
  authorize(id: TrainActor, reason: string) {
    const train = this.train(id);
    if (!this.radioAvailable(id)) throw new Error('Clearance cannot be delivered: PCC radio unavailable');
    // A PCC authorization alone cannot override a firmware interlock.
    train.pccIntent = 'release';
    train.clearance = { id: `pcc-${id}-${train.episode}-${++this.sequence}`, episode: train.episode, issuedAt: new Date().toISOString(), expiresAt: Date.now() + 180000 };
    const message: Message = { id: ++this.sequence, at: new Date().toISOString(), from: 'pcc', to: id, kind: 'clearance', text: reason, episode: train.episode, delivered: true };
    this.messages.push(message); this.log('clearance', `PCC clears ${train.label}`, reason, 'pcc');
    this.emit('wake', id, 'PCC departure clearance received. Verify local inputs, execute if safe and confirm the outcome. Respond in English.');
    return { clearance: train.clearance, delivered: true };
  }
  async traction(id: TrainActor, action: 'hold' | 'depart', reason: string) {
    const train = this.train(id), device = this.device(id);
    const observation = await device.write('traction', action === 'depart' ? 1 : 0);
    const readback = await device.read('traction');
    if (readback.value !== (action === 'depart' ? 1 : 0)) throw new Error('The local controller kept traction disabled');
    if (action === 'depart' && train.incident?.status === 'recovering') train.incident.status = 'resolved';
    this.log('action', `${train.label} · ${action === 'depart' ? 'departure executed' : 'hold executed'}`, reason, id);
    return { action, observation, readback, train: { ...train } };
  }
  network() { return { trains: this.trains.map(t => ({ id: t.id, label: t.label, branch: t.branch, position: t.position, direction: t.direction, status: t.status, pccIntent: t.pccIntent, episode: t.episode, clearance: t.clearance, report: this.reports[t.id] ?? null })), inbox: this.messages.filter(m => m.to === 'pcc' && m.delivered).slice(-16), bulletin: this.bulletin, profile:this.profile,
    constraints: 'Detailed sensors are private to each train. Use their reports, positions and directions. An instruction is a hold and revokes clearance; authorize_departure grants a verifiable clearance. Local firmware retains veto. Publish one fleet bulletin for each new incident.' }; }
  tick(dt: number) {
    if (this.paused) return;
    const seconds = dt * this.speed; this.simulatedSeconds += seconds;
    for (const train of this.trains) {
      const device = this.device(train.id);
      if (device.status !== 'ready' || train.observedTraction !== 1) { train.status = 'held'; train.delay += seconds; continue; }
      if (train.dwell > 0) { train.dwell -= seconds; train.status = 'dwell'; continue; }
      const path = paths[train.branch];
      const dwellSeconds = 20;
      const travelSeconds = ((train.branch === 'asnieres' ? 37 : 40) * 60 - (path.length - 2) * dwellSeconds) / (path.length - 1);
      const ahead = this.trains.some(other => other !== train && other.direction === train.direction && (train.position < 17 && other.position < 17 || other.branch === train.branch) && (other.position - train.position) * train.direction > 0 && (other.position - train.position) * train.direction < .35 + seconds / travelSeconds);
      if (ahead) { train.status = 'held'; train.delay += seconds; continue; }
      const next = train.position + train.direction * seconds / travelSeconds; train.status = 'running';
      if (next >= path.length - 1) { train.position = path.length - 1; train.direction = -1; train.dwell = train.branch === 'asnieres' ? 155 : 165; }
      else if (next <= 0) { train.position = 0; train.direction = 1; train.dwell = train.branch === 'asnieres' ? 155 : 165; }
      else { if (Math.floor(next) !== Math.floor(train.position)) { train.dwell = dwellSeconds; this.delivered++; } train.position = next; }
    }
    this.emit('change');
  }
  snapshot() {
    return { trains: this.trains.map(t => ({ ...t, hardware: this.device(t.id).snapshot(), sensors: sensors.map(s => ({ ...s, ...this.device(t.id).values[s.id] })), station: stations.find(s => s.id === paths[t.branch][Math.floor(t.position)])?.name })),
      profile: this.profile, bulletin: this.bulletin, firmwareClockScale:this.clockScale, stations, edges, paths, scenarios, messages: this.messages, journal: this.journal, paused: this.paused, speed: this.speed, simulatedSeconds: this.simulatedSeconds, delivered: this.delivered };
  }
  async stop() { this.paused = true; await Promise.all([...this.devices.values()].map(d => d.emergencyStop())); }
  async close() { await Promise.all([...this.devices.values()].map(d => d.close())); }
}
