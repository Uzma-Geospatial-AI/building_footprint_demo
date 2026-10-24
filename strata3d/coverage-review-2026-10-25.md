# Missing buildings and connected rows review

Reviewed against the user's screenshots, ArcGIS World Imagery, mapped OSM building outlines and the developer plans. Street View was not inspected. Exterior floor elevations, façade bays and ground registration remain estimates, not surveyed or cadastral geometry.

## Restored structures

- **D'Vine:** separate Level 5 podium and a branched shaft, registered to visible podium bases. The residential landuse parcel is not extruded. [EXSIM brochure](https://exsim.com.my/e-brochure/DVine_eBrochure.pdf), PDF pages 6 and 9, supports the shaft shape and facilities arrangement. The indicative 46-storey height configuration uses estimated floor heights.
- **D'Vervain:** original mapped podium `way/1158914503` plus two unequal shafts. [EXSIM brochure](https://exsim.com.my/e-brochure/DVERVAIN_eBrochure.pdf), PDF pages 5 and 14, supports the stepped shaft plans and Level 9 facilities. Tower elevations and 44/45-storey massing are indicative; this does not certify individual floor labels or strata parcel counts.
- **Lung Mu Temple:** original roofed building outline `way/1242229816`, with low walls and a pitched roof. The surrounding temple grounds are not extruded.
- **Empire City Zone 1:** restores `way/745554991` below the existing towers. The user-supplied food-court/shop labels are associated with this host; exact tenant units are not inferred. Estimated open lower-ground clearance and independently audited columns preserve the mapped service access.
- **Base 3 Parks / Alquiler:** low retail base at the pickup location published by [Alquiler](https://alquilermotorbike.com/contact.html). Maps place location: `[101.6136768,3.1640383]`. Shape and height are estimates from the visible frontage, not a separate high-rise building.
- **Vainpod:** attached as a searchable tenant of the existing Reflection retail/podium model. Maps place location `[101.613539,3.1630856]` is retained for provenance; the model search opens the existing host, avoiding a duplicate tower at a displaced roof marker.

## Empire Residential rows

Six individually reviewed rows complete omitted portions of the continuous roof/building lines. Source fragment `microsoft/2026-08-13/132232022/691049` merges into row `131007`, with its ID retained in the replacement audit. The parallel rows and the roads between them remain separate. Original footprints and image registration are retained in the model metadata.

The source file `src/coverage-review-sources.json` records image extents, trace pixels, original mapped outlines, plan references and support locations. `scripts/check-coverage-review.mjs` checks region membership, duplicates, simple polygons, parent containment, amenity containment and road clearance. The full geometry suite also tests exported GLB metadata and geometry in both detail levels.

The regional overview reduces repetitive residential window details at low detail while retaining the complete tower footprints and heights. Individual area models retain full façade detail.
