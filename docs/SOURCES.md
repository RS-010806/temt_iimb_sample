# Evidence and source register

Research reviewed: 14 September 2026. This register separates published product evidence, the company-name snapshot, illustrative demo inputs and implementation documentation.

## Product context

| Source | Supports | Boundary in this preview |
| --- | --- | --- |
| [IIM Bangalore TEMT website](https://iimb.freightemissions.com/) | Existing freight-emissions product and its public presentation. | The showcase is a separate implementation; it does not connect to private product APIs. |
| [DPIIT TEMT website](https://dpiit.freightemissions.com/) | Public DPIIT-facing TEMT portal. | The hostname alone is not proof of government endorsement or a live integration in this showcase. |
| [IIM Bangalore: DPIIT adoption](https://www.iimb.ac.in/node/14281) | IIMB's account of DPIIT adoption, dated 4 September 2025, and the ULIP context. | Attribute the published account to IIMB. This is evidence about the existing product. |
| [SGS verification statement](https://dpiit.freightemissions.com/certification.pdf) | Published verification for TEMT v1.3, dated 1 October 2024, referring to ISO 14083. | The verification applies to the version and scope in that statement. The demo estimator and this new website are not certified. |
| [IIM Bangalore: CAT](https://www.iimb.ac.in/node/11573) | Carbon Accounting Tool and Scope 1, 2 and 3 accounting context. | Do not describe the freight estimator as a complete organizational carbon inventory. |
| [IIM Bangalore: reported ISO 27001 certification](https://www.iimb.ac.in/node/11590) | IIMB's published certification report. | Do not transfer an organization's reported certification to this codebase, deployment or simulated service. |
| [Smart Freight Centre: GLEC v3.2](https://smartfreightcentre.org/news/13311209) | Freight-emissions methodology and version context. | Illustrative factors in the showcase must retain their own assumptions and labels; do not imply independent validation. |
| [SEBI BRSR reference, January 2026](https://www.sebi.gov.in/sebi_data/attachdocs/jan-2026/1769776024792.pdf) | Current disclosure context relevant to Indian listed enterprises. | Sector personalization is not a claim that every NIFTY 500 company has identical reporting obligations. The export is a demo output, not a compliance filing. |
| [NITI Aayog transport scenarios, 2026](https://www.niti.gov.in/sites/default/files/2026-02/Scenarios-Towards-Viksit-Bharat-and-Net-Zero-Sectoral-Insights-Transport.pdf) | Transport-sector context, including road's approximately 66% share of freight activity in the 2025 baseline. | Preserve the activity measure and baseline year beside any statistic. Do not describe it as freight emissions share. |

Names, logos and institutional references are contextual. No new customer testimonial, enterprise integration, SLA, latency benchmark, government authorization or exclusivity claim is inferred from them. The statement that the category has no competitors is not used as a verified fact.

## NIFTY 500 company snapshot

- Source: [NSE Indices constituent CSV](https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv).
- Retrieved: **14 September 2026**. The source CSV does not provide an effective date, so the public `asof` field means retrieval date.
- Count: **501 constituent records**, retained exactly from the available file. No row was removed to force the count to 500.
- Raw evidence: [`data/nifty500-source.csv`](data/nifty500-source.csv).
- Website records: [`../apps/web/public/data/nifty500.json`](../apps/web/public/data/nifty500.json).
- Source URL, retrieval timestamp, count and SHA-256: [`../apps/web/public/data/nifty500-meta.json`](../apps/web/public/data/nifty500-meta.json).
- Refresh: `python3 docs/scripts/refresh-nifty500.py`. This downloads the public CSV and validates row count, nonempty fields and unique symbols before writing.
- Integrity check: `python3 docs/scripts/check-source-data.py`. CI verifies the generated records against the retained CSV and its hash without downloading a changing external dataset during a build.

`name`, `symbol` and `industry` are the NSE source values. `sector` is an application grouping for an illustrative scenario:

| NSE industry | Demo preset |
| --- | --- |
| Automobile and Auto Components | `automotive` |
| Fast Moving Consumer Goods | `fmcg` |
| Healthcare | `pharma` |
| Chemicals; Metals & Mining; Construction Materials; Oil Gas & Consumable Fuels | `materials` |
| All remaining industries | `general` |

Company selection changes demonstration context. It does not reveal the selected company's shipments, emissions, contracts or customer status. Illustrative metrics must be visibly described as synthetic or scenario estimates.

## Visual references and assets

- [WHOOP](https://www.whoop.com/us/en/) informed the strong type hierarchy, restrained motion and quick product-led opening. Page layouts, wording and brand assets are not copied.
- Hero port photograph: [CHUTTERSNAP on Unsplash](https://unsplash.com/photos/fn603qcEA7g); [source image](https://images.unsplash.com/photo-1494412651409-8963ce7935a7). The photograph is a generic port image and is not labeled as an Indian location.
- Site typography uses Barlow Condensed, Manrope and IBM Plex Mono, with their applicable licenses retained alongside the distributed files. The design document uses Times New Roman; operational PDF exports use the standard PDF Times family. Original interface screenshots retain the site typography.
- Interface icons use Lucide. Icons communicate modes and actions; they do not indicate an integration or endorsement.

## Engineering and hosting sources

- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports): static landing and client interaction, with server work hosted separately.
- [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app), [static sites](https://render.com/docs/static-sites) and [monorepos](https://render.com/docs/monorepo-support): separate services from one repository; both build from repository root to access the shared calculator.
- [Render Blueprint specification](https://render.com/docs/blueprint-spec): service fields, build filters and deploys after checks pass.
- [Render free service limits](https://render.com/docs/free): the API can sleep after 15 idle minutes and may take about one minute to resume; static frontend delivery remains independent.
- [Render pricing](https://render.com/pricing): the lowest paid Node compute reviewed on 14 September 2026 is `0.5c-512mb`, $7 per month. The provided Blueprint uses the free plan.
- [Express CORS middleware](https://expressjs.com/en/resources/middleware/cors/): allowed frontend origins and browser preflight behavior.
- [GitHub Actions checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) and [upload-artifact](https://github.com/actions/upload-artifact): CI dependencies are pinned to reviewed release commit hashes.

## Delivery evidence

The [verification record](verification.md) contains observed deployment, calculation, browser and performance results with their conditions. The [case-study evidence](case-study-evidence.json) records screenshot provenance and the [document QA record](case-study-qa.md) records visual and structural checks. Measurements describe the tested release; they do not establish production SLAs or customer savings.
