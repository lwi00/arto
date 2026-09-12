import { z } from 'zod';

export const componentSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().min(1).max(120),
  description: z.string().max(500).default(''),
  pin: z.number().int().min(2).max(19),
  kind: z.enum(['digital-output', 'pwm-output', 'digital-input', 'analog-input']),
  unit: z.string().max(30).optional(),
  safeValue: z.number().int().min(0).max(255).default(0),
  min: z.number().int().min(0).max(1023).optional(),
  max: z.number().int().min(0).max(1023).optional(),
  pullup: z.boolean().default(false),
});
export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  board: z.literal('arduino-uno'),
  components: z.array(componentSchema).min(1).max(18),
  interlocks: z.array(z.object({ input: z.string(), output: z.string(), blockedValue: z.union([z.literal(0), z.literal(1)]) })).max(8).default([]),
}).superRefine((manifest, ctx) => {
  const ids = new Set<string>();
  const pins = new Set<number>();
  manifest.components.forEach((component, index) => {
    const error = (message: string) => ctx.addIssue({ code: 'custom', path: ['components', index], message });
    if (ids.has(component.id)) error('Component identifiers must be unique');
    if (pins.has(component.pin)) error('Each pin must have one declared owner');
    ids.add(component.id); pins.add(component.pin);
    if (component.kind === 'pwm-output' && ![3, 5, 6, 9, 10, 11].includes(component.pin)) error('Pin has no hardware PWM');
    if (component.kind === 'analog-input' && component.pin < 14) error('Analog inputs use pins 14–19 (A0–A5)');
    if (component.safeValue !== 0) error('This firmware supports only LOW/0 as watchdog fallback');
    if (component.min !== undefined && component.max !== undefined && component.min > component.max) error('min must not exceed max');
  });
  for (const [index, rule] of manifest.interlocks.entries()) {
    const input = manifest.components.find(c => c.id === rule.input);
    const output = manifest.components.find(c => c.id === rule.output);
    if (input?.kind !== 'digital-input' || !output?.kind.endsWith('-output')) ctx.addIssue({ code: 'custom', path: ['interlocks', index], message: 'Interlocks require a declared digital input and output' });
  }
});

export type Manifest = z.infer<typeof manifestSchema>;
export type Component = Manifest['components'][number];
export function parseManifest(value: unknown): Manifest { return manifestSchema.parse(value); }

export function assertWritableValue(component: Component, value: number): void {
  const ceiling = component.kind === 'digital-output' ? 1 : 255;
  if (!component.kind.endsWith('-output')) throw new Error(`${component.id} is read-only`);
  if (!Number.isInteger(value) || value < (component.min ?? 0) || value > (component.max ?? ceiling) || value > ceiling) {
    throw new Error(`Value outside allowed range for ${component.id}`);
  }
}
