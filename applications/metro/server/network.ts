export type Branch = 'asnieres' | 'saint_denis' | 'trunk';
export type Station = { id: string; name: string; branch: Branch; x: number; y: number; connections?: string[] };

// Operational schematic. Station names and order are sourced in data/SOURCES.md.
const trunkNames = [
  ['chatillon', 'Châtillon–Montrouge'], ['etienne', 'Malakoff–Rue Étienne Dolet'],
  ['malakoff', 'Malakoff–Plateau de Vanves'], ['porte_vanves', 'Porte de Vanves'],
  ['plaisance', 'Plaisance'], ['pernety', 'Pernety'], ['gaite', 'Gaîté'],
  ['montparnasse', 'Montparnasse–Bienvenüe'], ['duroc', 'Duroc'],
  ['saint_francois', 'Saint-François-Xavier'], ['varenne', 'Varenne'],
  ['invalides', 'Invalides'], ['clemenceau', 'Champs-Élysées–Clemenceau'],
  ['miromesnil', 'Miromesnil'], ['saint_lazare', 'Saint-Lazare'], ['liege', 'Liège'],
  ['place_clichy', 'Place de Clichy'], ['fourche', 'La Fourche'],
];
const asnieresNames = [['brochant', 'Brochant'], ['porte_clichy', 'Porte de Clichy'], ['mairie_clichy', 'Mairie de Clichy'], ['gabriel', 'Gabriel Péri'], ['agnettes', 'Les Agnettes'], ['courtilles', 'Les Courtilles']];
const denisNames = [['guy_moquet', 'Guy Môquet'], ['porte_ouen', 'Porte de Saint-Ouen'], ['garibaldi', 'Garibaldi'], ['mairie_ouen', 'Mairie de Saint-Ouen'], ['pleyel', 'Carrefour Pleyel'], ['porte_paris', 'Saint-Denis–Porte de Paris'], ['basilique', 'Basilique de Saint-Denis'], ['universite', 'Saint-Denis–Université']];

export const stations: Station[] = [
  ...trunkNames.map(([id, name], i) => ({ id, name, branch: 'trunk' as const, x: 410, y: 740 - i * 20 })),
  ...asnieresNames.map(([id, name], i) => ({ id, name, branch: 'asnieres' as const, x: 240, y: 346 - i * 50 })),
  ...denisNames.map(([id, name], i) => ({ id, name, branch: 'saint_denis' as const, x: 570, y: 346 - i * 36 })),
];
const fourche = stations.find(s => s.id === 'fourche')!; fourche.x = 410; fourche.y = 400;
const trunkIds = trunkNames.map(s => s[0]);
export const paths = {
  asnieres: [...trunkIds, ...asnieresNames.map(s => s[0])],
  saint_denis: [...trunkIds, ...denisNames.map(s => s[0])],
};
export const edges = [
  ...trunkIds.slice(1).map((id, i) => ({ from: trunkIds[i], to: id, branch: 'trunk' as Branch })),
  ...asnieresNames.map((s, i) => ({ from: i ? asnieresNames[i - 1][0] : 'fourche', to: s[0], branch: 'asnieres' as Branch })),
  ...denisNames.map((s, i) => ({ from: i ? denisNames[i - 1][0] : 'fourche', to: s[0], branch: 'saint_denis' as Branch })),
];
export const branchNames: Record<Branch, string> = { asnieres: 'Asnières–Gennevilliers', saint_denis: 'Saint-Denis', trunk: 'Tronc commun' };
