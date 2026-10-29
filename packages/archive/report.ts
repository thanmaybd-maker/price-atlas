import { createHash } from 'node:crypto';
import type { ArchiveObservation } from './wayback';

export const observationsDigest = (observations: ArchiveObservation[]) =>
  createHash('sha256').update(JSON.stringify(observations)).digest('hex');

/** An interrupted or index-only newer run must not silently apply an older result. */
export function reviewedObservations(
  saved: any,
  latest: any,
  now = Date.now(),
): ArchiveObservation[] {
  const age = now - Date.parse(saved?.generatedAt);
  if (
    saved?.mode !== 'validated' ||
    latest?.mode !== 'validated' ||
    latest.stopped ||
    !(age >= 0 && age < 48 * 3600000) ||
    saved.generatedAt !== latest.generatedAt ||
    !Array.isArray(saved.observations) ||
    saved.observations.length > 12400 ||
    latest.totals?.acceptedObservations !== saved.observations.length ||
    !saved.observationsSha256 ||
    saved.observationsSha256 !== latest.observationsSha256 ||
    saved.observationsSha256 !== observationsDigest(saved.observations)
  )
    throw new Error(
      'No matching, intact validated dry-run report from the last 48 hours. Run the dry run again.',
    );
  return saved.observations;
}
