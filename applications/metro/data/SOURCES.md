# Sources and attribution

## Line map

`public/assets/line13-horizontal.svg` comes from
[Plan Metro Paris 13](https://commons.wikimedia.org/wiki/File:Plan_Metro_Paris_13.svg),
by Chabe01 with modifications by AlexBurn44, version 6 December 2020.
It is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Changes: responsive viewBox and accessible metadata. Train markers are separate
overlays. `line13-geometry.json` derives coordinates and curves from this map and
retains the same attribution and license. Interchange symbols reflect the source
edition; the simulation uses station order and branch topology.

`public/assets/line13-logo.svg` comes from
[Paris transit icons, Metro 13](https://commons.wikimedia.org/wiki/File:Paris_transit_icons_-_M%C3%A9tro_13.svg),
listed on Commons as public domain under PD-textlogo.

## Train artwork

`scripts/fetch-assets.mjs` downloads three MF77 sprites from
[Paris Metro Simulator](https://parismetrosimulator.appspot.com/Metro.jsp):
`voiture1MF77.png`, `voiture2MF77.png` and `voiture3MF77.png` under `/metro/images/`.
They are stored locally, ignored by Git and excluded from the Arto package.
No open redistribution license has been established for this artwork.

## Incidents

Scenarios are defined in `server/scenarios.ts`. Some reference public posts from
[Ligne13_RATP](https://x.com/Ligne13_RATP); others are synthetic. Source links and
dates are stored with the relevant scenarios. Examples:

- [Door fault, 9 September 2026](https://x.com/Ligne13_RATP/status/2097690469534720257).
- [Passenger assistance, 10 September 2026](https://x.com/Ligne13_RATP/status/2097930813308281247).
- [Unattended baggage, 11 September 2026](https://x.com/Ligne13_RATP/status/2098404744528048229).

These are scenario references, not a live feed. An operator restores simulated
inputs; an estimated recovery time does not authorize departure. Alarms represent
reports, not automatic recognition of baggage or medical conditions.

Operating assumptions and their references are documented in [fleet sizing](fleet-sizing.md).
