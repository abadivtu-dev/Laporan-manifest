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
   * @param {boolean} [data.isFirstRun] - First time running
   * @param {string|null} [data.lastSnapshotDate] - Last snapshot date string
   * @param {Date} data.currentDate - Current date
   * @returns {string} Formatted caption
   */
  build(data) {
    const {
      packageData,
      newJamaahList = [],
      pindahanList = [],
      keluarList = [],
      isFirstRun = false,
      lastSnapshotDate = null,
    } = data;

    const safeNew = Array.isArray(newJamaahList) ? newJamaahList : [];
    const safePindah = Array.isArray(pindahanList) ? pindahanList : [];
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

    // "Jamaah Baru Hari Ini" count:
    // - If there are genuinely new jamaah, count = new + pindahan (combined)
    // - If only pindahan (no new), show "- (tidak ada)" — pindahan listed separately
    // - If neither, show "- (tidak ada)"
    const hasNew = safeNew.length > 0;
    const hasPindah = safePindah.length > 0;

    if (hasNew) {
      const totalNew = safeNew.length + safePindah.length;
      lines.push(`🆕 Jamaah Baru Hari Ini: ${totalNew} orang`);
      for (const nama of safeNew) {
        lines.push(`  ❯ ${nama}`);
      }
      for (const p of safePindah) {
        lines.push(`  ❯ ${p.nama}`);
      }
    } else {
      lines.push('🆕 Jamaah Baru Hari Ini: - (tidak ada)');
    }

    // Perpindahan section (scenario 3 & 4)
    if (safePindah.length > 0) {
      lines.push('');
      lines.push('🔄 Perpindahan Jamaah');
      for (const p of safePindah) {
        lines.push(`  ❯ ${p.nama} — dari ${p.dariPaket}`);
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

    // First run note (scenario 5)
    if (isFirstRun) {
      lines.push('');
      lines.push('📝 Pertama Kali — semua jamaah tercatat sebagai baru');
    }

    // Snapshot gap note (scenario 6)
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
