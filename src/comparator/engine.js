import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export function generateJamaahHash(jamaahArray) {
  const ids = jamaahArray.map((j) => j.uniqueId || j.NIK || j['ID REGISTER'] || '').sort();
  return createHash('sha256').update(ids.join(',')).digest('hex');
}

export function detectNewJamaah(yesterdayData, todayData, snapshotDate = null) {
  if (!yesterdayData || yesterdayData.length === 0) {
    const newJamaah = todayData || [];
    return {
      newJamaah,
      newCount: newJamaah.length,
      removedJamaah: [],
      removedCount: 0,
      isFirstRun: yesterdayData === null,
      noChanges: newJamaah.length === 0,
    };
  }

  if (!todayData || todayData.length === 0) {
    return {
      newJamaah: [],
      newCount: 0,
      removedJamaah: yesterdayData,
      removedCount: yesterdayData.length,
      isFirstRun: false,
      noChanges: false,
    };
  }

  const todayHash = generateJamaahHash(todayData);
  const yesterdayHash = generateJamaahHash(yesterdayData);

  if (todayHash === yesterdayHash) {
    return {
      newJamaah: [],
      newCount: 0,
      removedJamaah: [],
      removedCount: 0,
      isFirstRun: false,
      noChanges: true,
    };
  }

  const yesterdayIds = new Set(yesterdayData.map((j) => j.uniqueId));
  const todayIds = new Set(todayData.map((j) => j.uniqueId));

  const newJamaah = todayData.filter((j) => !yesterdayIds.has(j.uniqueId));
  const removedJamaah = yesterdayData.filter((j) => !todayIds.has(j.uniqueId));

  logger.debug(
    `[comparator] diff: total=${todayData.length}, new=${newJamaah.length}, removed=${removedJamaah.length}`
  );

  return {
    newJamaah,
    newCount: newJamaah.length,
    removedJamaah,
    removedCount: removedJamaah.length,
    isFirstRun: false,
    noChanges: newJamaah.length === 0 && removedJamaah.length === 0,
  };
}
