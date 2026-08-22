/** Everything under test that does not touch a Chrome API, bundled for node:test. */
export { identifyRequest, identifyCookie, blockableDomains, allTrackers, isFunctional } from '../src/knowledge/graph';
export { buildRules, PROTECTION_DESCRIPTIONS } from '../src/background/protection';
export { assessExposure } from '../src/analysis/exposure';
export { buildInventory } from '../src/analysis/inventory';
export { compare } from '../src/analysis/consistency';
export { analyzeText, htmlToText, emptyAnalysis } from '../src/analysis/policy';
export { looksLikeIdentifier } from '../src/background/cookies';
export { buildReport } from '../src/analysis/report';
export { buildDigest, EXPLAINER_INSTRUCTIONS } from '../src/analysis/digest';
export { siteOf } from '../src/domain/site';
export { DEFAULT_SETTINGS } from '../src/domain/settings';
export { FUNCTIONAL_CATEGORIES } from '../src/domain/types';
