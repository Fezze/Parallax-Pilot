# Collision geometry and the visible playfield

R3 uses the visible concave arrow as its damage silhouette. Its four boundary
segments are shared with the renderer; the filled interior counts as the hull,
while the open tail notch and bounding-box corners do not. The 3 px outline is
a forgiving visual margin: touching only its outer half does not cause damage.
A smaller rectangle would omit the wings, and a union of two triangles would
add redundant edge checks. Four squared-distance edge tests preserve the arrow
without introducing a geometry library. Tangency alone does not cause damage.

The grid indexes each asteroid by center once. Queries expand both sides by
the maximum supported radius (18 px), then by the largest horizontal movement
in the current step. Vertical bounds cover both old and new ship positions.
The candidate filter uses swept bounds without a travel-direction assumption.
The radius cap is part of the asteroid creation contract.

At each fixed simulation step, collision tests the asteroid's entire path in
the translating ship's frame. Endpoint containment and minimum segment-to-edge
squared distance detect crossings even when neither endpoint overlaps. No
additional collision substeps or multiple hit callbacks are introduced. A
crossing asteroid remains indexed until the following step if it exits the
viewport; pruning cannot erase the contact first. Objects wholly beyond the
pruning boundary are removed normally. Grid entries and two ship point buffers
are reused. The existing per-asteroid 260 ms simulation-age cooldown and
size-based damage remain unchanged. Multiple distinct asteroids can each hit.

Round flight limits keep the entire bounding rectangle inside the HUD inner
radius, with another 1.5 px for the ship stroke and a 3 px visible gap. Bounds
are rounded inward and applied to tilt, touch and swipe control positions as
well as the rendered geometry. Square limits keep a 14 px top/bottom inset,
clear of the 8 px HUD stroke. HUD and ship stroke constants are shared with
the renderer. Flight positions are intentionally narrower than the former
20 px center margin on round screens.

Dimensions and the circular safe envelope are computed once per game page and
passed to the two reused ship rectangles. Fixed updates change coordinates and
existing point buffers without rebuilding static geometry, square roots or
temporary dimension/limit/assignment objects. The public helper still computes
geometry by default for callers without a page-owned cache.

The oracle tests use independent triangle containment and projected edge
geometry, including all radii, both wrists, all five display families, cell
edges, moving/pruned scenes and relative-motion paths. Actual-page tests cover
fast crossings, swipe crossings, cooldown and control clamping. Browser images
cover both flight limits at low HP across the locale/device/wrist matrix.
Native screenshots establish actual simulator rasterization separately; none
of this measures physical-watch FPS, CPU, energy or sensor feel.
