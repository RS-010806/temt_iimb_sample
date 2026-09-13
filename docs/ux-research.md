# TEMT landing revision: design research and rationale

Research date: **14 September 2026**. Scope: a more cinematic freight hero, an estimator styled as an instrument panel, and stronger product storytelling while preserving the working calculator, enterprise workspace and reporting pipeline.

These recommendations combine observed official product content, published accessibility and performance guidance, and explicit design judgment. The reference sites do not establish a conversion lift for TEMT. This research pass used web retrieval and read-only repository inspection, without browser automation. WHOOP's India homepage timed out twice; its current official US homepage and enterprise documentation were retrievable and form the WHOOP evidence below.

## What the product references support

| Official reference | Observed pattern | Application to this revision |
| --- | --- | --- |
| [WHOOP homepage](https://www.whoop.com/us/en/) | The opening connects continuous measurements to decisions. Subsequent sections pair specific benefits with product interface imagery, then offer a clear next action. | Put a freight decision next to the headline. The preview should expose a meaningful number and a control immediately. Use authentic freight photography to establish context; keep the calculated result as the focal point. |
| [WHOOP Unite: Insights](https://support.whoop.com/s/article/The-Insights-Tab) | The documented enterprise flow moves from group summaries to individual detail, with metric and time-range selection and CSV export. | Let the visitor move from network totals to mode, subsidiary and shipment evidence. Keep selections visible as context changes. The landing should preview this depth and link to the existing workspace. |
| [Samsara product overview](https://www.samsara.com/products) | Product areas sit alongside explicit next actions and fuel/safety calculators. | Retain a useful estimator as an entry point. Follow it with concrete capabilities and a working scenario, so the page offers a way to evaluate the product. |
| [Samsara sustainability](https://www.samsara.com/solutions/sustainability) | The page connects operating data to fuel decisions, emissions reporting and stakeholder communication. Customer examples and integrations carry attribution. | Organize TEMT's story around inputs, decisions and reporting evidence. Keep sample outputs and actual institutional sources accessible. Reuse only TEMT relationships already supported in the [source register](SOURCES.md). |

The transfer is about hierarchy and workflow. WHOOP's health claims, customer results, hardware styling and proprietary imagery are not evidence for a freight product. Samsara's reported outcomes and integrations do not apply to this demonstration.

## Concrete visual decisions

The following are project design choices to validate on the finished page, rather than experimentally proven conversion rules.

1. **Give the hero a clear visual hierarchy.** Use one strong freight scene, a controlled dark text area and a large condensed headline. Let the image carry the sense of scale. Avoid adding multiple competing dashboards, decorative counters or a second animated focal point. Place the primary scenario action close to the proposition.
2. **Treat the estimator as a working instrument.** Visually group load and haul inputs, the road-to-rail control, baseline and scenario comparison, and the final reduction. Keep units attached to values. Use a stable-width number area so updates do not move neighboring content. A gauge or route schematic may complement the result; the exact value and comparison remain readable text.
3. **Make assumptions easy to inspect.** Keep the illustrative label, selected share and methodology control adjacent to the estimate. Retain the existing equal-distance and first/last-mile boundaries. A route illustration must not imply actual network optimization, live traffic or a verified company shipment.
4. **Give each section a different job.** The hero invites a decision; the trust strip opens source evidence; mode exploration explains coverage; sector scenarios establish relevance; the pipeline exposes calculation; reporting shows the output. Alternate image, schematic and data-led sections where each serves that job.
5. **Preserve enterprise context.** A selected mode, sector or rail share should accompany the visitor into the working demo. Keep the existing NIFTY company directory and synthetic scenario labels. Use verified source counts or explicit sample results when a concrete number helps; do not create customer savings, uptime or adoption figures for decoration.
6. **Use typography and spacing as the signature.** Retain the locally hosted Barlow Condensed, Manrope and IBM Plex Mono families. Reserve the condensed face for hierarchy and the mono face for small technical labels. Give form labels sufficient size and contrast. Use orange consistently for action or active selection, with additional text or shape indicating state.

## Motion specification

| Element | Recommended behavior | Reason and source |
| --- | --- | --- |
| Hero entrance | A short opacity/transform entrance that settles. Keep the proposition and CTA present without waiting for a sequence. Treat approximately 420–650 ms as a design starting point, not a standard. | web.dev recommends preferring `transform` and `opacity` and checking rendering cost. Animated layout, broad paint effects and unnecessary layer promotion can harm smoothness. [Animation guidance](https://web.dev/articles/animations-guide) |
| Estimator change | Update the actual calculation immediately. Use brief visual emphasis or a bar transform as feedback; avoid prolonged number counting that delays the final value. Approximately 180–240 ms is a project starting point. | The same compositor guidance supports restrained feedback. Numbers must continue to represent the calculation rather than an invented live feed. [Animation guidance](https://web.dev/articles/animations-guide) |
| Decorative route movement | Prefer one finite transition on deliberate mode selection. If any automatic movement continues for more than five seconds alongside other content, provide an operable pause, stop or hide mechanism unless the motion is essential. | This condition comes from WCAG 2.2 SC 2.2.2, Level A. Merely stopping while an element has focus does not satisfy a persistent pause mechanism. [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) |
| Reduced motion | Remove parallax, continuous travel and positional entrance effects when the preference is enabled. Keep results and interactions available in a settled presentation. | `prefers-reduced-motion` exposes a user preference. The separate WCAG criterion for disabling nonessential interaction-triggered motion is Level AAA; honoring the preference is a project requirement here. [Preference guidance](https://web.dev/articles/prefers-reduced-motion), [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) |

## Controls and responsive behavior

- **Keep the slider a real input.** Preserve its label, minimum, maximum and keyboard behavior. The WAI pattern specifies arrow keys, Home and End, and accessible values. If a custom slider is introduced, test touch assistive technology as well as desktop keys; the APG identifies support considerations. [WAI slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- **Implement tab semantics completely.** A tablist should put the active tab in the page's tab sequence and support arrow navigation between tabs. Use ordinary buttons instead if the interaction is not a tabbed panel. Repository inspection found that the baseline sector tabs needed this review; this research task did not edit them. [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- **Keep actions comfortable to hit.** The WCAG 2.2 AA minimum is generally 24 × 24 CSS pixels, with defined exceptions including spacing. Use a larger, approximately 44-pixel target for primary controls as a project choice. A small icon can sit inside a larger target. [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **Check the image behind the text.** Normal text generally needs 4.5:1 contrast; large text needs 3:1. Test the actual responsive crop and overlay, including muted instrument labels. Passing a brand color pair does not establish contrast over every photograph. [Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- **Preserve focus visibility.** A sticky header or panel must not entirely cover the control receiving keyboard focus. Test anchor destinations and focus after disclosures open. [Focus Not Obscured Minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- **Recompose on narrow screens.** Stack the story and estimator while retaining the control-to-result reading order. Check 320 CSS pixels and zoom rather than relying only on named device breakpoints. Reflow exceptions exist for inherently two-dimensional content; ordinary landing content should not require horizontal page scrolling. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

## Performance and evidence plan

The cinematic treatment should preserve the static landing's independent loading path. The existing repository already contains responsive AVIF/WebP freight assets and local WOFF2 fonts. Keep the main image discoverable early, size it for the viewport, and avoid lazy-loading the LCP image. Use high fetch priority selectively. A background image discovered only after CSS or a client-rendered image can delay that resource. [Optimize LCP](https://web.dev/articles/optimize-lcp)

Measure responsiveness on real actions such as mode selection, opening assumptions and starting the pipeline. web.dev classifies INP at or below 200 ms as good; its field assessment uses the 75th percentile, separated by mobile and desktop. A single lab interaction or Lighthouse performance score does not establish field INP. [INP guidance](https://web.dev/articles/inp)

For the revised release, record the deployed commit, public URL, viewport, throttling and test time. Recheck the hero image request, interaction console, keyboard flow, reduced motion, mobile layout and sample calculation parity. Publish observed performance results and conditions. Earlier case-study scores remain evidence for the earlier release until replaced by measurements of this revision.

## Case study refresh, after the revision is verified

The current case study and its published copies are intentionally unchanged by this research task. Once the revised build is deployed and checked:

1. Capture the public desktop hero and mobile hero in the new design. Recapture the pipeline if its visual treatment changes; refresh the workspace capture if that interface changes.
2. Update `docs/case-study-evidence.json` with the validated release, new measurements and screenshot provenance. Preserve the distinction between local calculation, warm API timing and service wake-up behavior.
3. Revise the design-decision text to describe the implemented result. Retain source and synthetic-data boundaries.
4. Regenerate the editable DOCX and PDF, verify exactly five pages, inspect every page, and recheck embedded fonts and links before replacing public downloads.

No new source-code changes, case-study edits, browser actions or performance measurements were made for this research artifact.
