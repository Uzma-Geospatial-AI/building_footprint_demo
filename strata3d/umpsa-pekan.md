# UMPSA Pekan campus

The Strata region **UMPSA Pekan** has a campus overview and five detailed zones:
FK / Masjid Al-Jazari / north campus; Canseleri / library / hall; engineering
faculties and laboratories; Kolej Kediaman 5 / PAP; sports and south campus.
There are 65 reviewed structures. They are separate from the Damansara exports.

## Geometry and evidence

`src/umpsa-data.js` retains each manually reviewed image trace, its image extent
and display resolution. `src/umpsa-sources.json` records the original OSM campus
boundary, building ways, reference URLs, names and acquisition review.
The OSM guardhouse and Block A KK5 retain their original nodes. Other selected
structures use individually traced visible envelopes. Curved and notched
buildings retain those shapes; open courtyards, roads, lakes and playing fields
are not filled with building masses. Engineering workshops have separate solar
roofs. Pitched roofs, the mosque's star outline and the PAP roof are modeled.

Primary references include the UMPSA mosque history and construction description,
the Library's *Wadah 2012* publication, FK's official site and named OSM points.
The library has four documented storeys and the mosque two. All metre heights
are estimates. Other floor counts, facade details and unconfirmed block names
are indicative. Roof-to-ground parallax and the unknown acquisition date of
the imagery mean these traces are not exact surveyed footprints or BIM.
No interior plans have been invented.

221 Microsoft footprint candidates were acquired for review. Their campus
coverage included old shapes, missing wings and roof fragments; none were
imported wholesale. Three OSM buildings outside the campus were excluded.
The seven northern training/residential masses outside the mapped campus
boundary were also excluded after boundary validation. Small tree-obscured
shelters and the far-south treatment works are not claimed as complete coverage.

## Runtime and delivery

Each structure starts at local ground zero and uses the existing terrain
grounding policy. No common raised campus slab is added. Exports are recentered
at the campus or zone origin. The Strata region menu can select UMPSA directly;
its model group only loads UMPSA, while the adjacent Damansara regions continue
to load together. Both model and footprint visibility switches are preserved.

Validation: `npm run check`, `npm run export:models`, `npm run check:assets`,
`npm run build`, and the publishing application's data, search and map UI tests.
`scripts/check-umpsa.mjs` checks campus membership, nonrectangular envelopes,
both geometry detail levels and a campus-only georeferenced export.
