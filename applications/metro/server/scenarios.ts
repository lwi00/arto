export const sensors = [
  { id: 'door_closed', label: 'Doors closed', pin: 2 },
  { id: 'power_ok', label: 'Power supply', pin: 3 },
  { id: 'alarm_clear', label: 'Passenger alarm', pin: 4 },
  { id: 'obstacle_clear', label: 'Track clear', pin: 7 },
  { id: 'radio_ok', label: 'Control link', pin: 8 },
  { id: 'route_clear', label: 'Route available', pin: 11 },
  { id: 'system_ok', label: 'Technical status', pin: 12 },
] as const;
export type SensorId = typeof sensors[number]['id'];
export type Scenario = { id: string; title: string; category: string; description: string; faults: SensorId[]; source?: string; sourceDate?: string; partial?: boolean };
export const scenarios: Scenario[] = [
  { id: 'doors', title: 'Door obstruction', category: 'Onboard', description: 'A door no longer confirms closure. The local controller cuts traction.', faults: ['door_closed'], source: 'https://x.com/Ligne13_RATP/status/2097690469534720257', sourceDate: '2026-09-09' },
  { id: 'alarm', title: 'Passenger alarm triggered', category: 'Onboard', description: 'A passenger alarm requires an onboard check.', faults: ['alarm_clear'] },
  { id: 'illness', title: 'Passenger illness report', category: 'Onboard', description: 'An onboard report indicates assistance is needed. The input represents an alarm, not a medical diagnosis.', faults: ['alarm_clear'], source: 'https://x.com/Ligne13_RATP/status/2097930813308281247', sourceDate: '2026-09-10' },
  { id: 'baggage', title: 'Unattended baggage report', category: 'Onboard', description: 'A baggage report requires field intervention. The agent cannot declare the item safe.', faults: ['alarm_clear'], source: 'https://x.com/Ligne13_RATP/status/2098404744528048229', sourceDate: '2026-09-11' },
  { id: 'motor', title: 'Traction fault', category: 'Onboard', description: 'A technical contact indicates a fault. Diagnose locally, then coordinate with control.', faults: ['system_ok'] },
  { id: 'power', title: 'Power supply loss', category: 'Onboard', description: 'Traction power is no longer confirmed. Control electronics remain powered in this simulation.', faults: ['power_ok'] },
  { id: 'brakes', title: 'Brake fault report', category: 'Onboard', description: 'A technical fault requires a hold and field intervention.', faults: ['system_ok'] },
  { id: 'signal', title: 'Signalling fault', category: 'Infrastructure', description: 'The local route-available signal is lost. Control must coordinate affected trains.', faults: ['route_clear'] },
  { id: 'switch', title: 'Points unavailable', category: 'Infrastructure', description: 'The planned route is unavailable. No alternative track is invented.', faults: ['route_clear'] },
  { id: 'obstacle', title: 'Obstacle on the track', category: 'Infrastructure', description: 'The obstacle input becomes active. The firmware stops traction before the agent responds.', faults: ['obstacle_clear'] },
  { id: 'leader', title: 'Preceding train stopped', category: 'Coordination', description: 'The route is held by a preceding train. Control coordinates the wait.', faults: ['route_clear'] },
  { id: 'priority', title: 'Conflicting route requests', category: 'Coordination', description: 'A route request is held. Train agents must obtain instructions from control.', faults: ['route_clear'] },
  { id: 'radio', title: 'PCC radio loss', category: 'Coordination', description: 'Messages from the train cannot be delivered. It stays stopped until the link returns.', faults: ['radio_ok'] },
  { id: 'contradictory', title: 'Conflicting observations', category: 'Coordination', description: 'Two local confirmations are missing. The agent must describe uncertainty and seek assistance.', faults: ['door_closed', 'system_ok'] },
  { id: 'partial', title: 'Partial restoration', category: 'Recovery', description: 'The first field action restores one input while another fault remains. A second intervention is needed.', faults: ['door_closed', 'power_ok'], partial: true },
  { id: 'recurrence', title: 'Recurring fault', category: 'Recovery', description: 'A door fault returns after recovery. Reinjecting creates a new episode and invalidates the old clearance.', faults: ['door_closed'] },
];

export function trainManifest(id: string, label: string) {
  return { schemaVersion: 1, id, name: `${label} · Onboard Arduino`, board: 'arduino-uno',
    description: 'Every digital input is 1 when its condition is confirmed. An input at 0 cuts traction in firmware. Departure also requires PCC clearance for the current episode.',
    components: [...sensors.map(s => ({ ...s, kind: 'digital-input', pullup: true })),
      { id: 'traction', label: 'Traction permission', pin: 9, kind: 'digital-output' },
      { id: 'indicator', label: 'Service indicator', pin: 13, kind: 'digital-output' }],
    interlocks: sensors.map(s => ({ input: s.id, output: 'traction', blockedValue: 0 })),
  };
}
