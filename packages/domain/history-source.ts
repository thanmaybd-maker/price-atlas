import type { Offer } from './index';

/** Provenance is separate from current-offer freshness. Never call a capture a live check. */
export function archiveEvidence(offer: Offer) {
  const e = offer.evidence;
  if (
    offer.source !== 'wayback' ||
    e?.kind !== 'archive' ||
    e.verifiedLiveByPriceAtlas !== false ||
    !/^\d{14}$/.test(e.captureTimestamp)
  )
    return null;
  try {
    const archive = new URL(e.archiveUrl);
    const original = new URL(e.originalUrl);
    if (
      archive.protocol !== 'https:' ||
      archive.hostname !== 'web.archive.org' ||
      archive.port ||
      archive.username ||
      archive.password ||
      !archive.pathname.startsWith(`/web/${e.captureTimestamp}/https://`) ||
      original.protocol !== 'https:' ||
      original.username ||
      original.password
    )
      return null;
    return e;
  } catch {
    return null;
  }
}

export function historySourceLabel(offer: Offer) {
  return archiveEvidence(offer)
    ? 'Internet Archive capture; not a live Price Atlas check'
    : 'Recorded observation; verify at checkout';
}
