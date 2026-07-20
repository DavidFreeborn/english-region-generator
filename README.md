# English Region Generator

A procedural simulator of imaginary English regions, rendered as an interactive
Ordnance Survey style map sheet with twenty-eight analytical lenses. Everything
runs in a single self-contained HTML file with no dependencies, no build step at
runtime, and no network access.

**Try it:** open `index.html` in any modern browser, or serve the repository
with GitHub Pages and visit the site root.

## What it does

Given a seed, an English region, a size, four map edges (flat, mountains, or
sea), and optional rivers, the engine generates a coherent county-scale world:

- **Terrain and geology.** Layered stratigraphy with faults, resistance-weighted
  erosion, orographic rainfall, priority-flood drainage, D8 flow accumulation,
  channel classification, valley incision, and estuary widening, with the
  drainage network recomputed against the final coastline. Requested rivers are
  realized as carved corridors and verified by sector, span, and discharge
  tests recorded in the diagnostics.
- **Settlement and growth.** A main town and its satellites grow era by era
  from medieval cores through Victorian terraces to modern estates, with
  historically motivated placement of collieries, mills, docks, retail parks,
  green belts, suburban stations, and edge-of-town retail strips. Land use is
  audited for realism: market towns carry modest trading estates while works
  towns carry heavy ones, scaled by regional economy.
- **People.** A household microsimulation settles the population with ethnic
  composition calibrated against ONS Census 2021 profiles (see `calibration/`),
  student quarters, relocation dynamics in person units, and an explicit
  dispersed-rural ledger so the settlement hierarchy sums exactly to the county
  total.
- **Economy and labour.** A conserved labour market: resident workers split
  into internal and outbound commuters, jobs into internal and inbound, with
  the identities R = I + O and J = I + B holding exactly and workplace capacity
  as a hard constraint.
- **Traffic.** Successive-averages equilibrium assignment on the classified
  road network, with gateway in- and out-commuting, through traffic, a
  correctly computed Wardrop gap, and demand conservation guaranteed by
  restricting every loading point to the network's giant component.
- **Public services.** Primary-school provision responds to the modelled roll
  with England's real spare-place surplus; ward pressure reflects the schools
  children actually attend. Hospital access is door-to-door minutes over the
  modelled networks.
- **Environment.** Flood risk is a HAND-style model referenced to channel
  water level, producing continuous EA Zone style floodplain ribbons and tidal
  lowland; verified at 8 to 12 percent coverage depending on region, matching
  the real England envelope.
- **Politics.** A poststratified individual-level voting model produces ward
  results for six general elections, 2010 through a 2026 estimate.

The in-app **Methodology** panel documents every model with its calibration
figures, honest caveats, and limitations.

## Repository layout

| Path | Contents |
| --- | --- |
| `index.html` | The complete built application (open this) |
| `src/` | Engine source, one file per subsystem, concatenated in order |
| `shell.html` | The HTML shell the build injects the engine into |
| `build.js` | Build script: `node build.js` produces `index.html` |
| `test.js` | Eight-region generation and determinism suite |
| `uitest.js` | Headless UI harness with the model assertion set |
| `calibration/` | Raw ONS reference table, fitting script, fitted priors |

## Building and testing

```
node build.js     # concatenates src/ into the shell, writes the app
node test.js      # eight regions plus same-seed determinism
node uitest.js    # UI smoke plus model assertions
```

The assertion set enforces, among other things: labour-ledger identities,
population identity including the dispersed-rural unit, requested-river
realization, district size bounds by type, ward contiguity, and full lens
coverage. Generation is deterministic per seed.

## Calibration

Ethnic composition priors are fitted against ONS Census 2021 profiles for 23
English local authorities with a deterministic 60/40 train and holdout split.
The raw table, the fitting script, the 19-to-10 group concordance, and the
fitted output ship in `calibration/` so the headline figures in the Methodology
panel can be re-derived independently with `node calibration/fit.js`. The
caveats stated there apply: the sample is small, contains no London boroughs,
and the scores are best read as development-set performance.

## Honest limitations

This is a toy with serious bookkeeping, not a planning tool. The Methodology
panel's Limitations section is part of the product: hydrology is coarse D8,
the traffic loop is short successive averages, the price-to-composition
coupling is a post-hoc adjustment, and every simplification a specialist would
notice is stated there rather than hidden.

## License

MIT. See `LICENSE`.
