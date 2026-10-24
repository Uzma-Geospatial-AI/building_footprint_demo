# Strata 3D - 25 October 2026

Select **Strata -> Region -> UMPSA Pekan** for the new campus overview and five zones. It contains 65 reviewed buildings and structures, including Canseleri, FK, engineering faculties and workshops, the library, Masjid Al-Jazari, KK5 / PAP and the sports complex. Curved and stepped footprints, distinct roof forms and solar workshops are modeled. Heights and imagery-derived outlines remain estimates. See [campus evidence and limits](umpsa-pekan.md) and [source records](umpsa-sources.json).

There are now 40 selectable areas (37 zones and three overviews), 1,643 structures and eight existing interior plans. No campus interiors are invented. UMPSA loads independently from the two adjacent Damansara overviews. Existing region selection and model/outline switches remain available. Asset cache version: `20261025d`.

## Previous release: Strata 3D model update — 24 October 2026

The Mutiara regional model and its retail/office area models now include:

- Fifteen mapped pedestrian bridge alignments: the Curve, Curve NX, IPC, IKEA, Lotus's, Nucleus, Surian and the MRT approaches. Roofs, steel frames, glass balustrades, joints, traffic-aware supports and four mapped access stairways are explicit geometry.
- Lotus's silver panel facade, warm entrance portal, tall glazing, canopy, parapet and teal/gold geometric sign.
- IKEA's service-side ribbing and approximate external escape stair, retaining lower parking access and roof solar banks.
- Former eCurve's original scalloped outline and two oval roof details, visibly labelled **historical reference** in the area panel and building name. This represents the older satellite image, not verified current construction or the proposed The LINES tower.

There are 906 Mutiara structures (including the historical reference) and 634 existing Perdana/UZMA structures. Bridges are infrastructure, not additional building footprints or strata parcels. Heights, facade dimensions, stair sections and support positions remain estimates; interiors are not inferred from facade photographs. See [reference notes](mutiara-references.md).

Regenerate assets from the source studio using `npm run export:models`, then `node tools/build_strata3d.mjs <studio-directory>`. Source checks cover geometry, model placement, lower parking, bridge routes, road clearances and GLB contents. Integration checks: `node tools/test_strata3d_data.js`, `node tools/test_mpk_strata_ui.js`, `node tools/test_mpk_strata.js`.

The module and asset cache version is `20261024c`. Both regional models remain visible together in Strata mode.
