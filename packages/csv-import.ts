export type CsvImportStatus = 'UPLOADED' | 'PARSED' | 'REVIEW' | 'MAPPED' | 'APPROVED' | 'POSTED' | 'RECONCILED';

export type CsvValidationResult = {
  isValid: boolean;
  errors: string[];
  rows: string[];
  header: string[];
  rowCount: number;
};

export const DEFAULT_CSV_IMPORT_LIMITS = {
  maxRows: 5_000,
  maxBytes: 10 * 1024 * 1024,
};

export function parseCsvRow(row: string): string[] {
  const values: string[] = [];
  let buffer = '';
  let insideQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"') {
      if (insideQuotes && row[index + 1] === '"') {
        buffer += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(buffer.trim());
      buffer = '';
    } else {
      buffer += char;
    }
  }

  values.push(buffer.trim());
  return values;
}

export function createDeterministicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildBusinessDuplicateKey(businessId: string, hash: string): string {
  return `${String(businessId ?? '').trim()}:${String(hash ?? '').trim()}`;
}

export function isAllowedImportTransition(currentStatus: string, nextStatus: string): boolean {
  const order = ['IMPORTED', 'PARSED', 'REVIEW', 'MAPPED', 'APPROVED', 'POSTED', 'RECONCILED'];
  const currentIndex = order.indexOf(currentStatus);
  const nextIndex = order.indexOf(nextStatus);

  if (currentIndex === -1 || nextIndex === -1) {
    return false;
  }

  if (currentIndex === nextIndex) {
    return true;
  }

  if (nextStatus === 'APPROVED' && (currentStatus === 'PARSED' || currentStatus === 'REVIEW' || currentStatus === 'MAPPED')) {
    return true;
  }

  if (nextStatus === 'POSTED' && currentStatus === 'APPROVED') {
    return true;
  }

  if (nextStatus === 'RECONCILED' && currentStatus === 'POSTED') {
    return true;
  }

  return nextIndex === currentIndex + 1;
}

export function validateCsvBankStatement(csvText: string, limits = DEFAULT_CSV_IMPORT_LIMITS): CsvValidationResult {
  const errors: string[] = [];
  const trimmed = String(csvText ?? '').trim();

  if (!trimmed) {
    return { isValid: false, errors: ['CSV file is empty.'], rows: [], header: [], rowCount: 0 };
  }

  const byteLength = new TextEncoder().encode(trimmed).length;
  if (byteLength > limits.maxBytes) {
    errors.push(`CSV exceeds the ${limits.maxBytes} byte upload limit.`);
  }

  const rows = trimmed.split(/\r?\n/).filter((row) => row.trim().length > 0);
  if (rows.length < 2) {
    errors.push('CSV file does not contain transaction rows.');
  }

  if (rows.length > limits.maxRows + 1) {
    errors.push(`CSV exceeds the maximum row limit of ${limits.maxRows}.`);
  }

  const header = rows[0] ? parseCsvRow(rows[0]) : [];
  if (header.length === 0) {
    errors.push('CSV header is missing.');
  }

  const normalizedHeader = header.map((value) => value.trim().toLowerCase());
  const hasDate = normalizedHeader.includes('date') || normalizedHeader.includes('transactiondate');
  const hasDescription = normalizedHeader.includes('description') || normalizedHeader.includes('narration');
  const hasAmount = normalizedHeader.some((value) => ['amount', 'debit', 'credit'].includes(value));

  if (!hasDate || !hasDescription || !hasAmount) {
    errors.push('CSV must include date, description or narration, and amount, debit, or credit columns.');
  }

  const pickNonEmpty = (...values: Array<string | undefined>): string => {
    const found = values.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof found === 'string' ? found.trim() : '';
  };

  for (let index = 1; index < rows.length; index += 1) {
    const rowText = rows[index];
    const values = parseCsvRow(rowText);
    if (values.length !== header.length) {
      errors.push(`Row ${index + 1} is malformed and does not match the header count.`);
      continue;
    }

    const record = Object.fromEntries(header.map((key, columnIndex) => [key.trim().toLowerCase(), values[columnIndex] ?? '']));
    const dateValue = pickNonEmpty(String(record.date ?? ''), String(record.transactiondate ?? '')).trim();
    const descriptionValue = pickNonEmpty(String(record.description ?? ''), String(record.narration ?? '')).trim();
    const amountValue = pickNonEmpty(String(record.amount ?? ''), String(record.debit ?? ''), String(record.credit ?? '')).trim();
    const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) && !Number.isNaN(new Date(`${dateValue}T00:00:00Z`).getTime());
    const hasValidAmount = amountValue.length > 0 && /^-?\d+(?:\.\d{1,2})?$/.test(amountValue.replace(/[RM\s,]/gi, ''));

    if (!hasValidDate || !descriptionValue || !hasValidAmount) {
      errors.push(`Row ${index + 1} is Malformed: malformed or missing required date, description, or amount data.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    rows,
    header,
    rowCount: rows.length,
  };
}
