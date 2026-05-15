import { logger } from '../utils/logger.js';

export function crosscheckWithInvoice(newJamaah, invoiceMap, currentPackage) {
  if (!newJamaah || newJamaah.length === 0) {
    return { jamaahBaru: [], jamaahPindahan: [], jumlahBaru: 0, jumlahPindahan: 0 };
  }

  if (!invoiceMap || invoiceMap.size === 0) {
    return {
      jamaahBaru: newJamaah,
      jamaahPindahan: [],
      jumlahBaru: newJamaah.length,
      jumlahPindahan: 0,
    };
  }

  const jamaahBaru = [];
  const jamaahPindahan = [];

  for (const jamaah of newJamaah) {
    const paketTerakhir = invoiceMap.get(jamaah.uniqueId);

    if (paketTerakhir && paketTerakhir !== currentPackage) {
      jamaah.paketAsal = paketTerakhir;
      jamaahPindahan.push(jamaah);
    } else {
      jamaahBaru.push(jamaah);
    }
  }

  logger.debug(
    `[crosscheck] filtered: total=${newJamaah.length}, baru=${jamaahBaru.length}, pindahan=${jamaahPindahan.length}`
  );

  return {
    jamaahBaru,
    jamaahPindahan,
    jumlahBaru: jamaahBaru.length,
    jumlahPindahan: jamaahPindahan.length,
  };
}
