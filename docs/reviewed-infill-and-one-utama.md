# Mutiara infill and 1 Utama exterior review — 24 October 2026

The Strata regional model includes 22 added structures and a revised Park 28 annex. 1 Utama is a separately selectable **Bandar Utama** extension of the regional view, not a claim that the mall belongs to the administrative Mutiara Damansara boundary.

## Source and geometry decisions

- PETRONAS Mutiara Damansara: OSM way 776319384 is the actual fuel canopy, previously excluded because it is tagged `building=roof`. It now has an open undercroft, indicative pump islands and three slender columns. The station parcel 1241123183 is not extruded. The separate Mesra/ZUS shop is an estimated imagery trace.
- Park 28 / theLocal Kopi Malaya Signature: original angular outline 1213508066 retained, with a terracotta hip roof, recessed single-storey core and supported veranda. The source service-road conflict is at the roof edge; the recessed core preserves access under the edge. Annex 1213508067 is corrected from a generic two-storey block to a single-storey pitched-roof pavilion.
- Reservoirs: original outlines 38952992 and 559336198 retained as shallow, circular water structures. Their heights and top fixtures are estimates.
- Two missing hillside villas: footprints traced from imagery as distinct low-rise volumes. Their coordinates and architecture are estimates, not surveyed house plans.
- PMU 132/33kV GIS Mutiara: original L-shaped service building 1220994486 restored outside the original coverage filter, plus an estimated low transformer-bay structure. The compound boundary is not a solid building.
- Reflection Residences: separate estimated ground footprints for the podium and tower, with a shared level datum. The developer brochure supports Level 7 facilities, Level 39 sky lounge and a single tower. The 152 m tower height is explicitly an estimate from CTBUH, not a measured dimension. The residential parcel 406793587 is not extruded.
- 1 Utama: mapped New Wing outer way 1041389573 and inner Secret Garden way 1030451611; Old Wing retail ways 825111135 / 612798662; 1 Utama E way 825111129; elevated connection way 628950746. Estimated supplementary outlines restore the central retail/atrium and AEON parking block visible in imagery. Original concavities remain intact. Secret Garden is placed on lower mall floors, and the Old/New Wing connection retains clearance over Lebuh Bandar Utama.

## References

- [1 Utama official overview](https://www.1utama.com.my/about-us/) — mall wings, 1 Utama E, seven retail levels, Secret Garden and covered connections.
- [1 Utama official access information](https://www.1utama.com.my/getting-here/) — pedestrian/MRT connections; no vehicle flyover is misclassified as a pedestrian bridge.
- [Reflection Residences developer brochure, hosted by KL Property Navi](https://klpropertynavi.com/files/topics/626_ext_11_0.pdf) — facilities layout and exterior reference, especially page 15 (PDF index 14).
- [CTBUH: Reflection Residences](https://www.skyscrapercenter.com/building/reflection-residences/44370) — 39 floors and **estimated** 152 m height.
- [SSM kiosk location list](https://www.ssm.com.my/Documents/register_business_company/business/Kiosk%20Tap%20it%20Location%20List.pdf) — PETRONAS Mutiara Damansara address on Jalan PJU 7/2.
- [Esri World Imagery service](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer) — visual registration of missing low-rise footprints and roof forms. Retrieval date is not the imagery capture date.
- [OpenStreetMap attribution and ODbL](https://www.openstreetmap.org/copyright) — mapped outlines. Exact source IDs, versions, timestamps and raw tags are retained in `src/reviewed-infill-sources.json`.

The deployment also ships the audit record as `strata3d/reviewed-infill-sources.json`.

Manual traces retain their geographic image extent, image size and pixel controls in that source file. Oblique imagery and roof displacement limit registration accuracy, especially for Reflection; the model does not assert survey precision. Facade bays, rooftop equipment, colours and unsourced heights remain indicative. No interactive Google Street View session was available for this review, and no official mall strata boundaries or interior plans are invented.

## Verification

The dedicated infill check validates unique IDs, original mapped rings, trace provenance, regional selection, open fuel-canopy driving space and road clearance below the mall connection. Existing geometry checks cover finite normals, declared heights, concave-perimeter containment and GLB round trips. Existing viewer checks cover shared podium/tower ground datums, terrain contacts and high/low detail loading.

## Jalan PJU 7/26 screenshot follow-up

Two further unmapped buildings were matched to the user screenshots and georeferenced imagery: the grey-roof courtyard house near 101.60949, 3.16091, and the small roadside house near 101.60980, 3.16219. The former uses a concave roof/building outline, two rooftop panel banks and a separate low open courtyard basin. The latter is a single-storey tan hip-roof volume with smaller residential windows. No building mesh covers the courtyard; its basin is an amenity with no terrain platform. Both footprints, heights and facade details remain visual estimates. The pixel controls and imagery extent are stored under pju726 in the source audit.

## Stepped hillside villa corrections

The west villa (original OSM way 1051972777) now includes the rear roof deck, circular deck feature, setback upper residence and lower entrance canopy. The original mapped middle block is retained in the feature audit; the extended envelope is explicitly estimated. The circle has no assumed helipad use. The east villa uses a narrow west wing, rear upper block, lower east wing and uncovered terraces, with solar arrays restricted to the observed roof banks. Both models use residential windows instead of generic curtain walls. Their modeling envelopes do not generate solid terrain platforms. Component polygons, approximate heights and image pixel controls are in the source audit. This review uses the supplied screenshots and georeferenced World Imagery, not an interactive Street View inspection.
