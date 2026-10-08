# Bloom homepage implementation

The public root page now uses the supplied Bloom Beauty Studio visual direction. Branding is provisional. Existing admin and booking components and backend contracts remain unchanged.

## Interactions
- Service cards and category filters load from the services/categories APIs. Only active entries are shown; cards display admin images, PKR prices, discounts and duration. Initial 12-item display expands with Show more services. Loading, error/retry and empty states are included.
- Bridal button expands details; booking actions scroll to the Bloom appointment notice.
- The legacy men’s booking component and catalog selectors have been removed from the homepage. Online booking is explicitly unavailable until a replacement is implemented. Backend/admin modules are retained.
- Old /#booking links point to the appointment section.
- Mobile navigation supports an expanded state, and reduced-motion preferences are respected.

## Images
The supplied reference image is stored locally as design-reference.png. CSS crops only its photography regions into the hero, inspiration gallery and bridal panel; all page text, controls and layout are native HTML. This shared 2.6 MB image should eventually be replaced with separate approved, optimized salon photos. Gallery images are labeled as inspiration, not client work.

## Verification
- Production Angular build passed, with existing bundle/component size warnings, external stylesheet inlining warning and Bootstrap selector warning.
- 90 existing QA tests passed.
- Obsolete booking handoff tests were removed along with that integration.
- Browser visual checks could not run because Chromium download returned invalid archives. Responsive CSS needs a final browser review.

## Remaining rollout work
Connect a separate ladies salon database and configure services/staff/contact details before accepting real bookings. About/gallery standalone routes, the expanded booking UI, and the admin interface still use the inherited theme. No salon database or service records were modified by this change.

Dynamic catalog update: production build and 4 catalog regression tests passed.
