/** User-facing wording. Kept in one place so the product speaks with one voice. */
import type {
  Category,
  Confidence,
  DataType,
  Dimension,
  ExposureLevel,
  HarvestField,
  Provenance,
} from '../domain/types';

export const HARVEST_FIELD_LABELS: Record<HarvestField, string> = {
  email: 'email',
  phone: 'phone',
  'first-name': 'first name',
  'last-name': 'last name',
  city: 'city',
  state: 'state',
  postcode: 'postcode',
  gender: 'gender',
  'date-of-birth': 'date of birth',
  country: 'country',
  'site-id': 'an ID this site holds for you',
};

export const DATA_TYPE_LABELS: Record<DataType, string> = {
  'pages-visited': 'The pages you visit here',
  'products-viewed': 'The products you look at',
  'search-terms': 'What you search for',
  'approximate-location': 'Roughly where you are',
  'device-info': 'Your device and browser',
  'browser-fingerprint': 'A fingerprint of this browser',
  'advertising-id': 'An advertising ID that follows you between sites',
  'persistent-id': 'An ID that recognises you on your next visit',
  'hashed-identity': 'A scrambled version of your email or account',
  purchases: 'What you buy',
  'session-recording': 'A replay of your mouse, scrolling and clicks',
  'form-input': 'What you type into forms',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  advertising: 'Advertising',
  analytics: 'Analytics',
  'session-replay': 'Session recording',
  'tag-manager': 'Tag manager',
  social: 'Social embed',
  personalization: 'Personalisation',
  'customer-engagement': 'Marketing & support',
  'consent-management': 'Cookie banner',
  'fraud-prevention': 'Bot & fraud protection',
  authentication: 'Sign-in',
  payment: 'Payments',
  cdn: 'Content delivery',
  hosting: 'Site infrastructure',
  unknown: 'Unidentified',
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  tracking: 'Tracking',
  advertising: 'Advertising',
  crossSite: 'Cross-site activity',
  fingerprinting: 'Fingerprinting',
  policyTransparency: 'Policy transparency',
  userControl: 'Your control',
  dataRetention: 'How long they keep it',
};

/** The wording matters more than the colour: "none seen" is a claim about Veyl, not the site. */
export const LEVEL_LABELS: Record<ExposureLevel, string> = {
  'none-seen': 'NONE SEEN',
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  unknown: 'UNKNOWN',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  observed: 'Observed',
  declared: 'Declared',
  inferred: 'Inferred',
  unknown: 'Unknown',
};

export const PROVENANCE_MEANING: Record<Provenance, string> = {
  observed: 'Veyl watched this happen in your browser.',
  declared: 'The site states this in its own published policy.',
  inferred: 'Veyl concluded this from what the service is known to do.',
  unknown: 'Veyl cannot establish this and will not guess.',
};
