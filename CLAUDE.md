# CLAUDE.md — LAPORAN-WA

## Project: Sistem Laporan WA Otomatis Manifest Jamaah Umroh

Sistem ini berjalan setiap hari pukul 21:00 WIB, mengambil data dari Google Sheets (manifest jamaah + database invoice), membandingkan dengan snapshot kemarin untuk mendeteksi jamaah baru, lalu mengirim screenshot tabel + caption rangkuman ke grup WhatsApp.

---

## Tech Stack (WAJIB DIPATUHI)

| Komponen | Teknologi | Versi Minimal |
|----------|-----------|---------------|
| Runtime | Node.js | 18+ |
| WA Client | @whiskeysockets/baileys | latest |
| Screenshot | Playwright (Chromium) | latest |
| Template | Handlebars | ^4.7 |
| Google Sheets | googleapis (Service Account) | latest |
| Database | better-sqlite3 | ^9.0 |
| Scheduler | node-cron | ^3.0 |
| Logger | pino | ^8.0 |
| Test | vitest | ^1.0 |

---

## Aturan Kode — JAVASCRIPT/NODE.JS

### 1. Module System
- **WAJIB ES Modules** (`"type": "module"` di package.json)
- Import style: `import { x } from 'y'`
- Jangan pernah pakai `require()` atau CommonJS
- Extension di import: tidak perlu (gunakan Node.js resolver)

### 2. Naming Convention
- File: **kebab-case** (`message-sender.js`, `caption-builder.js`)
- Class: **PascalCase** (`CaptionBuilder`, `PipelineOrchestrator`)
- Function/variable: **camelCase** (`fetchJamaahData`, `newJamaahList`)
- Constant/Config: **UPPER_SNAKE_CASE** (`MAX_RETRY_ATTEMPTS`, `WA_GROUP_JID`)
- Private methods: **prefix underscore** (`_parseColumnHeaders()`, `_buildLookupMap()`)

### 3. Async
- **WAJIB async/await** — dilarang pakai `.then()` / `.catch()` callback chain
- Error handling: **try/catch** di setiap async function, re-throw dengan context
- Concurrency: gunakan `Promise.all()` untuk I/O paralel yang independen

### 4. Function Design
- **Satu fungsi = satu tanggung jawab** (Single Responsibility Principle)
- Maksimal panjang fungsi: **30 baris** (di luar whitespace)
- Maksimal parameter: **4** — lebih dari itu pakai object destructuring
- Pure functions untuk semua logic diff/comparison — side effects hanya di I/O boundary

### 5. Error Handling Pattern
```javascript
// WAJIB: setiap async function bungkus dengan try/catch + context
async function fetchJamaahData(spreadsheetId, sheetName) {
  try {
    // ... fetch logic
  } catch (error) {
    // Re-throw dengan context yang jelas untuk debugging
    throw new Error(`Gagal fetch ${sheetName} dari ${spreadsheetId}: ${error.message}`, { cause: error });
  }
}
```
- Jangan pernah swallow error diam-diam — log selalu sebelum re-throw
- Custom error classes untuk domain-specific errors: `SheetsApiError`, `WASendError`, `SnapshotError`

### 6. Magic Numbers / Strings
- **DILARANG** hardcode magic number/string langsung di logic
- Semua nilai konfigurasi: taruh di `.env` atau constant file
- Rate limit delays, max retry, column names, sheet names → semua di config

### 7. Logging
- Pakai **pino** structured logging
- Levels: `fatal`, `error`, `warn`, `info`, `debug`
- Setiap action pipeline WAJIB log: start, success, failure, retry
- Format: `[{module}] {action}: {detail}`
- Jangan log data jamaah mentah (NIK, no telp) — truncate/hash

### 8. Security (NON-NEGOTIABLE)
- **DILARANG KERAS** hardcode credential di source code
- Spreadsheet ID, Service Account JSON, WA credentials → WAJIB dari `.env`
- File `.env` dan `auth_info/` → WAJIB di `.gitignore`
- NIK, nomor paspor, nomor telepon → jangan pernah di-log
- Service account JSON → jangan pernah di-commit (`GOOGLE_APPLICATION_CREDENTIALS` path saja)
- Session file Baileys (`auth_info/`) → jangan pernah di-commit

---

## Project Structure (WAJIB DIIKUTI)

```
src/
├── index.js                    # Entry point: init scheduler
├── config/
│   └── index.js                # Config loader + validasi .env
├── scheduler/
│   └── cron.js                 # node-cron (21:00 WIB)
├── pipeline/
│   ├── orchestrator.js         # Pipeline utama (state machine)
│   ├── spreadsheet-processor.js
│   └── paket-processor.js
├── sheets/
│   ├── client.js               # Google Sheets API client
│   ├── manifest-reader.js      # Baca DATA JAMAAH
│   ├── invoice-reader.js       # Baca BIG DATA INVOICE
│   └── parser.js               # Segmentasi blok paket
├── comparator/
│   ├── engine.js               # Diff algorithm (hash pre-check + set-based)
│   └── crosscheck.js           # Invoice cross-check
├── reporter/
│   ├── html-builder.js         # Handlebars engine
│   ├── screenshotter.js        # Playwright capture
│   └── caption-builder.js      # CaptionBuilder class
├── sender/
│   ├── wa-client.js            # Baileys init + auth + reconnect
│   ├── message-queue.js        # Rate-limited message sender
│   └── group-finder.js         # Cari grup WA
├── storage/
│   ├── database.js             # SQLite init + migrations
│   ├── snapshot-store.js       # Snapshot CRUD
│   └── report-log.js           # sent_reports CRUD
├── templates/
│   └── table.hbs               # Template HTML tabel
└── utils/
    ├── logger.js               # Pino logger
    ├── retry.js                # Exponential backoff
    ├── validator.js            # Data validation
    └── formatters.js           # Currency, date formatters

data/                            # SQLite database (git-ignored)
auth_info/                       # Baileys session (git-ignored)
tests/                           # Mirror src/ structure
├── unit/                        # Unit tests (pure functions)
└── integration/                 # Integration tests (with mocks)
```

---

## TDD — Test-Driven Development (WAJIB)

### Aturan
1. **Tulis test DULU, baru implementasi** — tidak ada kode production tanpa test gagal dulu
2. Test file naming: `{module-name}.test.js` — mirror dari `src/`
3. Framework: **vitest**

### Test Coverage Minimum
- Utils/pure functions: **100% coverage**
- Pipeline logic (diff, crosscheck, caption): **100% coverage**
- I/O functions (sheets client, WA client): **mock the I/O, test the logic**
- Integration tests: minimal alur utama (fetch → diff → render → send)

### Testing Patterns

```javascript
// Unit test: pure function
import { describe, it, expect } from 'vitest';
import { detectNewJamaah } from '../src/comparator/engine.js';

describe('detectNewJamaah', () => {
  it('mendeteksi jamaah yang ada hari ini tapi tidak kemarin', () => {
    const kemarin = [
      { uniqueId: 'NIK-001', nama: 'Andi' },
      { uniqueId: 'NIK-002', nama: 'Budi' },
    ];
    const hariIni = [
      { uniqueId: 'NIK-001', nama: 'Andi' },
      { uniqueId: 'NIK-002', nama: 'Budi' },
      { uniqueId: 'NIK-003', nama: 'Cici' },
    ];
    const result = detectNewJamaah(kemarin, hariIni);
    expect(result).toHaveLength(1);
    expect(result[0].nama).toBe('Cici');
  });

  it('return array kosong jika tidak ada jamaah baru', () => {
    const kemarin = [{ uniqueId: 'NIK-001', nama: 'Andi' }];
    const hariIni = [{ uniqueId: 'NIK-001', nama: 'Andi' }];
    expect(detectNewJamaah(kemarin, hariIni)).toHaveLength(0);
  });

  it('semua jamaah dianggap baru jika snapshot kemarin null (first run)', () => {
    const hariIni = [{ uniqueId: 'NIK-001' }, { uniqueId: 'NIK-002' }];
    const result = detectNewJamaah(null, hariIni);
    expect(result).toHaveLength(2);
  });
});
```

```javascript
// Integration test: mock I/O
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Pipeline Integration: spreadsheet → report', () => {
  beforeEach(() => {
    vi.mock('../src/sheets/client.js');
    vi.mock('../src/sender/wa-client.js');
  });

  it('full flow: fetch → diff → caption → send', async () => {
    // Arrange: mock sheets return & snapshot
    // Act: run pipeline
    // Assert: verify caption content & WA send called
  });
});
```

---

## Git Workflow

### Branch Naming
- `feature/<deskripsi>` — fitur baru
- `fix/<deskripsi>` — bug fix
- Format: kebab-case, bahasa Indonesia atau Inggris konsisten

### Commit Message
```
<tipe>: <deskripsi singkat>

- Poin detail 1
- Poin detail 2
```

Tipe: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### Rules
- Jangan commit file `.env`, `node_modules/`, `auth_info/`, `data/`
- Jangan commit kode yang test-nya gagal
- Jangan skip hooks (`--no-verify`) kecuali situasi darurat
- **DILARANG** amend commit yang sudah dipublish
- **DILARANG** force push ke main

---

## Database Schema (SQLite)

**WAJIB diinisialisasi oleh `storage/database.js` saat startup.**

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_id TEXT NOT NULL,
  paket_code TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  jamaah_hash TEXT NOT NULL,
  jamaah_count INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(spreadsheet_id, paket_code, snapshot_date)
);

CREATE TABLE IF NOT EXISTS sent_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_id TEXT NOT NULL,
  paket_code TEXT NOT NULL,
  report_date TEXT NOT NULL,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  sent_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(spreadsheet_id, paket_code, report_date)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  spreadsheets_total INTEGER DEFAULT 0,
  spreadsheets_done INTEGER DEFAULT 0,
  pakets_total INTEGER DEFAULT 0,
  pakets_done INTEGER DEFAULT 0,
  pakets_failed INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now','localtime')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS spreadsheet_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id INTEGER NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paket_count INTEGER DEFAULT 0,
  paket_done INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id)
);

CREATE TABLE IF NOT EXISTS paket_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spreadsheet_run_id INTEGER NOT NULL,
  paket_code TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (spreadsheet_run_id) REFERENCES spreadsheet_runs(id)
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Konfigurasi .env (REQUIRED)

```
# Google Sheets
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
SPREADSHEET_MONTHLY_IDS=id1,id2,id3
INVOICE_SPREADSHEET_ID=179bhJ8t29IlR0ThZidJFz43cocBF2ODYFaO4GLaBX14

# WhatsApp
WA_GROUP_JID=628xxxxxxxxxx-xxxxxx@g.us
WA_GROUP_NAME=Laporan Manifest Umroh

# Schedule
REPORT_TIME=21:00
TZ=Asia/Jakarta

# Rate Limiting (dalam milidetik)
WA_MIN_DELAY_MS=4000
WA_MAX_DELAY_MS=8000

# Pipeline
MAX_SPREADSHEET_RETRY=3
MAX_PAKET_RETRY=3
MAX_WA_SEND_RETRY=3
PIPELINE_TIMEOUT_MS=1800000
```

---

## Anti-Patterns (JANGAN PERNAH)

1. Jangan panggil Google Sheets API langsung dari pipeline — lewat `sheets/` module
2. Jangan kirim WA langsung dari reporter — lewat `sender/` module
3. Jangan mix logic data processing dengan rendering
4. Jangan baca file langsung di library code — semua file I/O lewat storage module
5. Jangan hardcode path, ID, nama sheet, atau nilai konfigurasi apapun
6. Jangan swallow error tanpa log — setiap catch block harus ada `logger.error()`
7. Jangan commit kode tanpa test — TDD wajib
8. Jangan buat fungsi lebih dari 30 baris — refactor
