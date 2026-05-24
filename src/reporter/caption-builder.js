import { formatDate } from '../utils/formatters.js';

export class CaptionBuilder {
  /**
   * Build caption text for the report.
   * @param {Object} data
   * @param {Object} data.packageData - Package metadata
   * @param {string} data.packageData.namaPaket
   * @param {string} data.packageData.tanggal
   * @param {string} data.packageData.maskapai
   * @param {string} [data.packageData.rute]
   * @param {string} data.packageData.kodePaket
   * @param {number} data.packageData.totalJamaah
   * @param {number} data.packageData.maxSeat
   * @param {number} data.packageData.sisaSeat
   * @param {string[]} [data.newJamaahList] - Names of new jamaah
   * @param {Array<{nama: string, dariPaket: string}>} [data.pindahanList] - Moved jamaah
   * @param {string[]} [data.keluarList] - Names of jamaah who left
  
   * @param {string|null} [data.lastSnapshotDate] - Last snapshot date string
   * @param {Date} data.currentDate - Current date
   * @returns {string} Formatted caption
   */
  build(data) {
    const {
      packageData,
      newJamaahGroups = [],
      pindahanGroups = [],
      newCount = 0,
      pindahanCount = 0,
      keluarList = [],
      lastSnapshotDate = null,
    } = data;

    const safeNewGroups = Array.isArray(newJamaahGroups) ? newJamaahGroups : [];
    const safePindahGroups = Array.isArray(pindahanGroups) ? pindahanGroups : [];
    const safeKeluar = Array.isArray(keluarList) ? keluarList : [];

    const lines = [];
    const pd = packageData;

    // Paket kosong (scenario 7)
    if (!pd || pd.totalJamaah === 0) {
      lines.push(`📦 ${pd?.namaPaket || '-'}`);
      if (pd?.tanggal) lines.push(`📅 Berangkat: ${pd.tanggal}`);
      if (pd?.maskapai) {
        const ruteStr = pd.rute ? ` | ${pd.rute}` : '';
        lines.push(`✈️ ${pd.maskapai}${ruteStr}`);
      }
      lines.push('');
      lines.push('Belum ada jamaah');
      if (pd?.sisaSeat != null) {
        lines.push(`📊 Sisa Seat: ${pd.sisaSeat}`);
      }
      return lines.join('\n');
    }

    // Header
    lines.push(`📦 ${pd.namaPaket}`);
    lines.push(`📅 Berangkat: ${pd.tanggal}`);
    const ruteStr = pd.rute ? ` | ${pd.rute}` : '';
    lines.push(`✈️ ${pd.maskapai}${ruteStr}`);
    lines.push('');

    // Total jamaah
    const maxSeatStr = pd.maxSeat ? `/${pd.maxSeat} seat` : ' seat';
    lines.push(`👥 Total Jamaah: ${pd.totalJamaah}${maxSeatStr}`);

    // "Jamaah Baru Hari Ini" — tampilkan per grup (leader + pax)
    const hasNew = safeNewGroups.length > 0;
    const hasPindah = safePindahGroups.length > 0;

    if (hasNew || hasPindah) {
      const totalNew = newCount + pindahanCount;
      lines.push(`🆕 Jamaah Baru Hari Ini: ${totalNew} orang`);
      for (const g of safeNewGroups) {
        lines.push(g.pax > 1 ? `  ❯ ${g.leader} + ${g.pax} pax` : `  ❯ ${g.leader}`);
      }
      for (const g of safePindahGroups) {
        lines.push(g.pax > 1 ? `  ❯ ${g.leader} + ${g.pax} pax` : `  ❯ ${g.leader}`);
      }
    }

    // Perpindahan section (scenario 3 & 4)
    if (hasPindah) {
      lines.push('');
      lines.push('🔄 Perpindahan Jamaah');
      for (const g of safePindahGroups) {
        const label = g.pax > 1 ? ` + ${g.pax} pax` : '';
        lines.push(`  ❯ ${g.leader}${label} — dari ${g.dariPaket}`);
      }
    }

    // Jamaah keluar (scenario 8)
    if (safeKeluar.length > 0) {
      lines.push('');
      lines.push('🚫 Jamaah Keluar');
      for (const nama of safeKeluar) {
        lines.push(`  ❯ ${nama}`);
      }
    }

    // Snapshot gap note
    if (lastSnapshotDate) {
      const formatted = formatDate(lastSnapshotDate);
      lines.push('');
      lines.push(`📝 Data sejak ${formatted}`);
    }

    // Sisa seat
    lines.push(`📊 Sisa Seat: ${pd.sisaSeat}`);

    return lines.join('\n');
  }
}
