# Pekan — UMPSA campus

The Strata region **Pekan** has a campus overview and five detailed zones:
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

## Exterior detail review — 25 October 2026

The user corrected two identities: `reference/umpsa-dewan` is **Dewan
Konvokesyen**, while `reference/umpsa-civic-office` is **Dewan Cheese**. They
remain separate buildings at their reviewed locations. The earlier OSM Cheese
point is superseded as naming evidence for the convocation hall.

[UMPSA's October 2026 handover report](https://news.umpsa.edu.my/campus-life/jkr-serah-projek-dewan-konvokesyen-umpsa)
documents two storeys and a triple-volume main hall, with Wau Pungguk and orbit
inspiration. [Kamal Engineering's project renders](https://www.kesb.com.my/projects/ump/)
inform the sweeping roof, recessed wall shell, warm soffit, radial support ribs,
white framed panels with diagonal members and main entrance canopy. The three
exterior panel bands do not represent three occupied storeys. The roof peak is
estimated at 18 m. The imagery-derived outer roof perimeter is retained; the
wall shell is inset so the overhang does not extend into neighbouring ground.

All 65 structures now have use-specific exterior treatment. Occupied buildings
have framed glazing, mullions, shading and door lintels; academic blocks have
vertical fins, residences have corridor screens, workshops have shuttered doors
and high-level glazing, and pitched roofs have seams. The water tank has a
cylindrical shell with reinforcing bands instead of office windows. These small
details are indicative, not individually measured. CTAR uses its verified full
name, Canseleri Tun Abdul Razak; unverified block identities remain descriptive.

Both map and detail models retain these features. The overview simplifies small
trim geometry to reduce transfer and drawing cost; detail zones retain its
depth. Stable `umpsa` identifiers and filenames preserve existing bookmarks,
while the displayed region and overview name are **Pekan**.

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
