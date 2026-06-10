/**
 * Tiny dependency-free CSV parser for the jobs/sites import. Ports the legacy
 * parseCSV (PapaParse with header:true, skipEmptyLines:true) closely enough for
 * the Yunex job/site exports: quoted fields, escaped quotes ("") and stripping
 * of stray null bytes from UTF-16 files read as text.
 */

export interface ParsedCsv {
  fields: string[];
  rows: Record<string, string>[];
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const NULL_CHAR = String.fromCharCode(0);
const BOM_CHAR = String.fromCharCode(0xfeff);

/** Parse raw CSV text into header + keyed rows. */
export function parseCsvText(input: string): ParsedCsv {
  // Strip stray null bytes (UTF-16 files read as text) + a leading BOM, then
  // normalise line endings and split into non-empty lines.
  let text = input.split(NULL_CHAR).join('');
  if (text.charAt(0) === BOM_CHAR) text = text.slice(1);
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { fields: [], rows: [] };

  const fields = splitLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: Record<string, string> = {};
    fields.forEach((field, idx) => {
      row[field] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { fields, rows };
}

/** Read a File as UTF-8 text and parse it. */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseCsvText(String(reader.result ?? '')));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('CSV parse failed'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}
