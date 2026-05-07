// ─── Minimal RFC-4180 CSV parser ───────────────────────────────────────────
// Single self-contained file so we don't add a new dep. Handles:
//   • Comma + semicolon delimiters (auto-detected by first non-quoted occurrence)
//   • Quoted fields with embedded commas + newlines
//   • Doubled quotes ("") → literal "
//   • UTF-8 BOM stripped
//   • CRLF or LF line endings
//
// Returns: rows as string[][]. Empty rows are dropped.

export function parseCsv(input: string): string[][] {
  // Strip BOM
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  // Auto-detect delimiter by scanning for first occurrence in unquoted region
  // of the first ~512 chars.
  const delimiter = detectDelimiter(text.slice(0, 512));

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\r') {
      // Treat CRLF (or bare CR) as line terminator
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Flush trailing field
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  return rows;
}

function detectDelimiter(sample: string): string {
  let inQ = false;
  let commas = 0;
  let semis = 0;
  for (const c of sample) {
    if (c === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (c === ',') commas += 1;
    else if (c === ';') semis += 1;
  }
  return semis > commas ? ';' : ',';
}
