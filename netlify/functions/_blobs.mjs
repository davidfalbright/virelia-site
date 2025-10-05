// Centralized Blobs access used by all functions.
// If the Netlify runtime injects Blobs context, `getStore('name')` works.
// If it doesn't (your current case), we pass siteID + token explicitly.

import { getStore } from '@netlify/blobs';

// Your site id (you showed it in a screenshot)
const SITE_ID = process.env.NETLIFY_SITE_ID || 'feee20ac-11cd-4017-8bf0-cfdfcaafcfaa';
// Personal Access Token you created in User settings → Personal access tokens.
// Put it in Netlify env vars as NETLIFY_BLOBS_TOKEN (all scopes / all contexts).
const TOKEN   = process.env.NETLIFY_BLOBS_TOKEN || '';

export function emailCodesStore() {
  // If a token exists, always pass it – works locally and in prod.
  const opts = TOKEN ? { siteID: SITE_ID, token: TOKEN } : undefined;
  return getStore('email_codes', opts);
}
