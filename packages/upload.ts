import { AccountingEngine, DecimalMoney } from './accounting';
import type { AccountingRuleService } from './accounting-rules';
import { TransactionService, type TransactionRecord } from './transactions';
import type { SubscriptionService } from './subscriptions';

export type UploadType = 'BANK_STATEMENT' | 'PDF' | 'CSV' | 'EXCEL' | 'RECEIPT' | 'INVOICE' | 'BILL';
export type ExtractionStatus = 'IMPORTED' | 'PARSED' | 'REVIEW' | 'MAPPED' | 'APPROVED' | 'POSTED' | 'RECONCILED';
export type DuplicateStatus = 'NONE' | 'POSSIBLE_DUPLICATE' | 'CONFIRMED_DUPLICATE';
export type TransactionSuggestionType = 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' | 'JOURNAL';

export interface UploadFile {
  name: string;
  size: number;
  type: string;
  content?: string;
}

export interface UploadRecord {
  id: string;
  businessId: string;
  filename: string;
  fileHash: string;
  fileType: string;
  sourceType: UploadType;
  status: 'REJECTED' | 'UPLOADED' | 'PARSED' | 'REVIEW' | 'APPROVED' | 'POSTED';
  uploadedBy: string;
  uploadedAt: string;
  parsedAt?: string | null;
  approvedAt?: string | null;
  postedAt?: string | null;
  errorInfo?: string[];
  duplicateReference?: string | null;
  rawData?: string | null;
  normalizedData?: string | null;
  importIdentifier?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface UploadAuditEvent {
  businessId: string;
  actor: string;
  event: string;
  target: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  message?: string;
}

export interface NormalizedRow {
  originalDate?: string;
  date: string;
  description: string;
  reference?: string;
  amount: string;
  rawAmount?: string;
  direction: 'DEBIT' | 'CREDIT';
  balance?: string;
  currency: string;
  transactionId?: string;
}

export interface CandidateSuggestion {
  type: TransactionSuggestionType;
  financialAccountId?: string;
  accountId?: string;
  amount: string;
  description: string;
  referenceNo?: string;
  date: string;
  ruleId?: string;
  ruleMatch?: string;
}

export interface UploadCandidate {
  id: string;
  businessId: string;
  source: UploadType;
  raw: Record<string, string | undefined>;
  normalized: NormalizedRow;
  duplicateStatus: DuplicateStatus;
  status: ExtractionStatus;
  suggestion: CandidateSuggestion;
  confidence: number;
  auditTrail?: string[];
}

export interface ImportBatch {
  id: string;
  businessId: string;
  fileName: string;
  source: UploadType;
  uploadedBy: string;
  uploadedAt: string;
  status: 'UPLOADED' | 'PARSING' | 'REVIEW' | 'APPROVED' | 'POSTED';
  candidates: UploadCandidate[];
  errors: Array<{ row?: string; error: string; action: string }>;
}

export class UploadConvertService {
  private readonly engine: AccountingEngine;
  private readonly transactionService: TransactionService;
  private readonly batches = new Map<string, ImportBatch>();
  private readonly uploads = new Map<string, UploadRecord>();
  private readonly hashIndex = new Map<string, string>();
  private readonly transactionSignatureIndex = new Map<string, string>();
  private readonly idempotency = new Map<string, TransactionRecord>();
  private readonly uploadAuditTrail = new Map<string, UploadAuditEvent[]>();
  private readonly accountingRules?: AccountingRuleService;
  private readonly ruleUserId: string;

  constructor(engine: AccountingEngine, options: { accountingRules?: AccountingRuleService; ruleUserId?: string; subscriptionService?: SubscriptionService } = {}) {
    this.engine = engine;
    this.transactionService = new TransactionService(engine, { subscriptionService: options.subscriptionService });
    this.accountingRules = options.accountingRules;
    this.ruleUserId = options.ruleUserId ?? 'system';
  }

  createUploadRecord(file: UploadFile, businessId: string, uploadedBy: string, sourceType: UploadType): UploadRecord {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(' '));
    }

    const fileHash = this.generateFileHash(file.content ?? `${file.name}:${file.size}:${file.type}`);
    const duplicateReference = this.hashIndex.get(`${businessId}:${fileHash}`) ?? null;
    const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const record: UploadRecord = {
      id,
      businessId,
      filename: file.name,
      fileHash,
      fileType: file.type,
      sourceType,
      status: 'UPLOADED',
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      parsedAt: null,
      approvedAt: null,
      postedAt: null,
      errorInfo: [],
      duplicateReference: null,
      rawData: file.content ?? null,
      normalizedData: null,
      importIdentifier: fileHash,
      metadata: { size: file.size, mimeType: file.type, extension: file.name.split('.').pop()?.toLowerCase() ?? '' },
    };

    this.uploads.set(id, record);
    this.hashIndex.set(`${businessId}:${fileHash}`, id);
    this.recordAuditEvent(id, businessId, uploadedBy, 'upload_created', id, { filename: file.name, sourceType, fileHash });
    if (duplicateReference) {
      record.duplicateReference = duplicateReference;
      this.recordAuditEvent(id, businessId, uploadedBy, 'duplicate_detected', id, { duplicateReference });
    }
    return record;
  }

  getUploadAuditTrail(id: string, businessId: string): UploadAuditEvent[] {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    const upload = this.uploads.get(id);
    if (!upload) {
      throw new Error('Upload record not found.');
    }
    if (upload.businessId !== businessId) {
      throw new Error('Business authorization failed.');
    }
    return this.uploadAuditTrail.get(id) ?? [];
  }

  listUploads(businessId: string): UploadRecord[] {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    return [...this.uploads.values()].filter((record) => record.businessId === businessId);
  }

  getUploadRecord(id: string, businessId: string): UploadRecord {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    const upload = this.uploads.get(id);
    if (!upload) {
      throw new Error('Upload record not found.');
    }
    if (upload.businessId !== businessId) {
      throw new Error('Business authorization failed.');
    }
    return upload;
  }

  private recordAuditEvent(uploadId: string, businessId: string, actor: string, event: string, target: string, metadata: Record<string, string | number | boolean | null> = {}): void {
    const trail = this.uploadAuditTrail.get(uploadId) ?? [];
    trail.push({
      businessId,
      actor,
      event,
      target,
      timestamp: new Date().toISOString(),
      metadata,
    });
    this.uploadAuditTrail.set(uploadId, trail);
  }

  private getCandidateById(candidateId: string): { batch: ImportBatch; candidate: UploadCandidate } | null {
    for (const batch of this.batches.values()) {
      const candidate = batch.candidates.find((entry) => entry.id === candidateId);
      if (candidate) {
        return { batch, candidate };
      }
    }
    return null;
  }

  private findUploadForCandidate(candidate: UploadCandidate): UploadRecord | undefined {
    for (const batch of this.batches.values()) {
      if (batch.businessId !== candidate.businessId) continue;
      if (!batch.candidates.some((entry) => entry.id === candidate.id)) continue;
      return [...this.uploads.values()].find((upload) => upload.businessId === candidate.businessId && upload.filename === batch.fileName);
    }
    return undefined;
  }

  private resolveSuggestionAccounts(): { bankAccountId?: string; revenueAccountId?: string; expenseAccountId?: string } {
    const accounts = (this.engine as any).accounts as Map<string, { id: string; accountType: string; name: string }> | undefined;
    const financialAccounts = (this.engine as any).financialAccounts as Map<string, { id: string; type: string; name: string }> | undefined;

    const bankAccountId = financialAccounts ? [...financialAccounts.values()].find((account) => account.type === 'BANK')?.id : undefined;
    const revenueAccountId = accounts ? [...accounts.values()].find((account) => account.accountType === 'REVENUE')?.id : undefined;
    const expenseAccountId = accounts ? [...accounts.values()].find((account) => account.accountType === 'EXPENSE')?.id : undefined;

    return {
      bankAccountId: bankAccountId ?? undefined,
      revenueAccountId: revenueAccountId ?? undefined,
      expenseAccountId: expenseAccountId ?? undefined,
    };
  }

  private allowTransition(currentStatus: string, nextStatus: string): boolean {
    const order = ['IMPORTED', 'PARSED', 'REVIEW', 'MAPPED', 'APPROVED', 'POSTED', 'RECONCILED'];
    const currentIndex = order.indexOf(currentStatus);
    const nextIndex = order.indexOf(nextStatus);
    if (currentIndex === -1 || nextIndex === -1) return false;
    if (currentIndex === nextIndex) return true;
    if (nextStatus === 'APPROVED' && (currentStatus === 'PARSED' || currentStatus === 'REVIEW' || currentStatus === 'MAPPED')) return true;
    if (nextStatus === 'POSTED' && currentStatus === 'APPROVED') return true;
    if (nextStatus === 'RECONCILED' && currentStatus === 'POSTED') return true;
    return nextIndex === currentIndex + 1;
  }

  private updateUploadStatus(uploadId: string, businessId: string, status: UploadRecord['status'], actor: string, reason?: string): UploadRecord {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new Error('Upload record not found.');
    }
    if (upload.businessId !== businessId) {
      throw new Error('Business authorization failed.');
    }
    upload.status = status;
    if (status === 'PARSED') upload.parsedAt = new Date().toISOString();
    if (status === 'APPROVED') upload.approvedAt = new Date().toISOString();
    if (status === 'POSTED') upload.postedAt = new Date().toISOString();
    this.recordAuditEvent(uploadId, businessId, actor, status === 'REJECTED' ? 'upload_rejected' : status === 'PARSED' ? 'upload_parsed' : status === 'APPROVED' ? 'upload_approved' : status === 'POSTED' ? 'upload_posted' : 'upload_reprocessed', uploadId, { status, reason: reason ?? '' });
    return upload;
  }

  validateFile(file: UploadFile): ValidationResult {
    const errors: string[] = [];
    const allowedMimeTypes = new Map<string, string[]>([
      ['text/csv', ['csv']],
      ['application/csv', ['csv']],
      ['application/vnd.ms-excel', ['csv', 'xls']],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
      ['application/vnd.ms-excel.sheet.macroenabled.12', ['xls']],
      ['application/pdf', ['pdf']],
      ['image/png', ['png']],
      ['image/jpeg', ['jpg', 'jpeg']],
      ['image/jpg', ['jpg', 'jpeg']],
      ['image/webp', ['webp']],
    ]);
    const allowedExtensions = new Set(['csv', 'xls', 'xlsx', 'pdf', 'png', 'jpg', 'jpeg', 'webp']);
    const name = (file.name ?? '').trim();
    const extension = (name.split('.').pop() ?? '').toLowerCase();

    if (!name || !extension || !allowedExtensions.has(extension)) {
      errors.push('Unsupported file format.');
    }

    if (name.includes('..') || name.includes('/') || name.includes('\\') || /[<>:"|?*\x00-\x1F]/.test(name)) {
      errors.push('Filename is unsafe.');
    }

    if (!file.type?.trim()) {
      errors.push('MIME type is required.');
    } else if (allowedMimeTypes.has(file.type.toLowerCase()) && extension && !allowedMimeTypes.get(file.type.toLowerCase())?.includes(extension)) {
      errors.push('MIME type does not match the file extension.');
    }

    if (file.type && !allowedMimeTypes.has(file.type.toLowerCase()) && file.name && extension && allowedExtensions.has(extension)) {
      errors.push('Unsupported MIME type.');
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      errors.push('File is empty.');
    }

    if (file.size > 10 * 1024 * 1024) {
      errors.push('File exceeds the 10 MB upload limit.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      message: errors.length === 0 ? 'File validated.' : 'Upload rejected.',
    };
  }

  private generateFileHash(content: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < content.length; index += 1) {
      hash ^= content.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private buildDuplicateSignature(candidate: { date: string; description: string; amount: string; reference?: string; accountId?: string; transactionId?: string }): string {
    return `${candidate.date}|${this.normalizeDescription(candidate.description).toLowerCase()}|${candidate.amount}|${this.normalizeReference(candidate.reference ?? '').toLowerCase()}|${candidate.accountId ?? ''}|${candidate.transactionId ?? ''}`;
  }

  private suggestionFor(description: string, fallback: CandidateSuggestion, businessId: string): CandidateSuggestion {
    if (!this.accountingRules) return fallback;
    const preview = this.accountingRules.preview({ businessId, userId: this.ruleUserId, description });
    if (!preview.matched || !preview.rule?.autoSuggest || !preview.suggestion) return fallback;
    const transactionType = preview.suggestion.transactionType === 'INCOME'
      ? 'MONEY_IN'
      : preview.suggestion.transactionType === 'EXPENSE'
        ? 'MONEY_OUT'
        : fallback.type;
    return {
      ...fallback,
      type: transactionType,
      accountId: preview.suggestion.accountId ?? fallback.accountId,
      financialAccountId: preview.suggestion.financialAccountId ?? fallback.financialAccountId,
      ruleId: preview.rule.id,
      ruleMatch: preview.suggestion.matchValue,
    };
  }

  private createRejectedUpload(fileName: string, businessId: string, uploadedBy: string, fileHash: string, sourceType: UploadType, errors: string[], duplicateReference?: string | null): UploadRecord {
    const record: UploadRecord = {
      id: `upload-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      businessId,
      filename: fileName,
      fileHash,
      fileType: fileName.split('.').pop()?.toLowerCase() ? `.${fileName.split('.').pop()?.toLowerCase()}` : 'unknown',
      sourceType,
      status: 'REJECTED',
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      parsedAt: null,
      approvedAt: null,
      postedAt: null,
      errorInfo: errors,
      duplicateReference: duplicateReference ?? null,
    };
    this.uploads.set(record.id, record);
    this.recordAuditEvent(record.id, businessId, uploadedBy, 'upload_rejected', record.id, { filename: fileName, sourceType, fileHash, reason: errors.join('; ') });
    return record;
  }

  retryParseUpload(uploadId: string, businessId: string, csvText: string): ImportBatch {
    const upload = this.getUploadRecord(uploadId, businessId);
    const currentBatch = [...this.batches.values()].find((batch) => batch.fileName === upload.filename && batch.businessId === businessId);
    const replacement = this.processBankStatementCsv(csvText, upload.filename, businessId, upload.uploadedBy);
    if (currentBatch) {
      this.batches.delete(currentBatch.id);
    }
    this.recordAuditEvent(uploadId, businessId, upload.uploadedBy, 'upload_reprocessed', uploadId, { filename: upload.filename, candidateCount: replacement.candidates.length });
    return replacement;
  }

  updateCandidateMapping(candidateId: string, patch: Partial<CandidateSuggestion>): UploadCandidate {
    const result = this.getCandidateById(candidateId);
    if (!result) throw new Error('Candidate not found.');
    const { candidate } = result;
    candidate.status = 'MAPPED';
    candidate.suggestion = {
      ...candidate.suggestion,
      ...patch,
      amount: patch.amount ?? candidate.suggestion.amount,
      description: patch.description ?? candidate.suggestion.description,
      referenceNo: patch.referenceNo ?? candidate.suggestion.referenceNo,
      date: patch.date ?? candidate.suggestion.date,
    };
    candidate.auditTrail = [...(candidate.auditTrail ?? []), `Mapping edited for ${candidate.suggestion.referenceNo ?? candidate.normalized.reference ?? 'candidate'}`];
    const upload = this.findUploadForCandidate(candidate);
    if (upload) {
      this.recordAuditEvent(upload.id, candidate.businessId, 'system', 'mapping_edited', candidateId, {
        status: candidate.status,
        description: candidate.suggestion.description,
        referenceNo: candidate.suggestion.referenceNo ?? '',
      });
    }
    return candidate;
  }

  updateCandidateStatus(candidateId: string, status: ExtractionStatus): UploadCandidate {
    const result = this.getCandidateById(candidateId);
    if (!result) throw new Error('Candidate not found.');
    const { candidate } = result;
    if (!this.allowTransition(candidate.status, status)) {
      throw new Error(`Invalid candidate transition from ${candidate.status} to ${status}.`);
    }
    candidate.status = status;
    return candidate;
  }

  transitionUploadStatus(candidateId: string, businessId: string, nextStatus: 'IMPORTED' | 'PARSED' | 'REVIEW' | 'MAPPED' | 'APPROVED' | 'POSTED' | 'RECONCILED'): UploadCandidate {
    const result = this.getCandidateById(candidateId);
    if (!result) throw new Error('Candidate not found.');
    const { candidate } = result;
    if (!this.allowTransition(candidate.status, nextStatus)) {
      throw new Error(`Invalid lifecycle transition from ${candidate.status} to ${nextStatus}.`);
    }
    const upload = [...this.uploads.values()].find((entry) => entry.businessId === businessId && [...this.batches.values()].some((batch) => batch.businessId === businessId && batch.candidates.some((item) => item.id === candidateId)));
    if (!upload) {
      throw new Error('Upload record not found.');
    }
    candidate.status = nextStatus;
    this.recordAuditEvent(upload.id, businessId, 'system', 'mapping_edited', candidateId, { status: nextStatus, description: candidate.suggestion.description });
    return candidate;
  }

  processBankStatementCsv(csvText: string, fileName: string, businessId: string, uploadedBy: string): ImportBatch {
    const validation = this.validateFile({ name: fileName, size: csvText.length, type: 'text/csv', content: csvText });
    const fileHash = this.generateFileHash(csvText);
    const duplicateUploadRef = this.hashIndex.get(`${businessId}:${fileHash}`);

    if (!validation.isValid) {
      const upload = this.createRejectedUpload(fileName, businessId, uploadedBy, fileHash, 'BANK_STATEMENT', validation.errors, duplicateUploadRef ?? null);
      this.hashIndex.set(`${businessId}:${fileHash}`, upload.id);
      this.recordAuditEvent(upload.id, businessId, uploadedBy, 'upload_rejected', upload.id, { filename: fileName, reason: validation.errors.join('; ') });
      return {
        id: `batch-${Date.now()}`,
        businessId,
        fileName,
        source: 'BANK_STATEMENT',
        uploadedBy,
        uploadedAt: new Date().toISOString(),
        status: 'REVIEW',
        candidates: [],
        errors: [{ error: validation.errors.join(' '), action: 'REJECT' }],
      };
    }

    const rows = csvText.split(/\r?\n/).filter((row) => row.trim().length > 0);
    if (rows.length < 2) {
      const upload = this.createRejectedUpload(fileName, businessId, uploadedBy, fileHash, 'BANK_STATEMENT', ['CSV file does not contain transaction rows.']);
      this.hashIndex.set(`${businessId}:${fileHash}`, upload.id);
      this.recordAuditEvent(upload.id, businessId, uploadedBy, 'upload_rejected', upload.id, { filename: fileName, reason: 'CSV file does not contain transaction rows.' });
      return {
        id: `batch-${Date.now()}`,
        businessId,
        fileName,
        source: 'BANK_STATEMENT',
        uploadedBy,
        uploadedAt: new Date().toISOString(),
        status: 'REVIEW',
        candidates: [],
        errors: [{ error: 'CSV file does not contain transaction rows.', action: 'REJECT' }],
      };
    }

    const existingUpload = duplicateUploadRef ? this.uploads.get(duplicateUploadRef) : undefined;
    const isSameInFlightUpload = Boolean(existingUpload && existingUpload.businessId === businessId && existingUpload.filename === fileName && existingUpload.fileHash === fileHash && existingUpload.status === 'UPLOADED');
    const effectiveDuplicateReference = duplicateUploadRef && !isSameInFlightUpload ? duplicateUploadRef : null;
    const uploadId = isSameInFlightUpload && duplicateUploadRef
      ? duplicateUploadRef
      : `upload-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const existingParseRecord = this.uploads.get(uploadId);
    const uploadRecord: UploadRecord = existingParseRecord
      ? { ...existingParseRecord, status: 'PARSED', parsedAt: new Date().toISOString(), fileType: 'text/csv', sourceType: 'BANK_STATEMENT', errorInfo: [], duplicateReference: effectiveDuplicateReference }
      : {
          id: uploadId,
          businessId,
          filename: fileName,
          fileHash,
          fileType: 'text/csv',
          sourceType: 'BANK_STATEMENT',
          status: 'PARSED',
          uploadedBy,
          uploadedAt: new Date().toISOString(),
          parsedAt: new Date().toISOString(),
          approvedAt: null,
          postedAt: null,
          errorInfo: [],
          duplicateReference: effectiveDuplicateReference,
          rawData: csvText,
          normalizedData: null,
          importIdentifier: `${businessId}:${fileHash}`,
          metadata: { size: csvText.length, mimeType: 'text/csv', extension: fileName.split('.').pop()?.toLowerCase() ?? '' },
        };

    this.uploads.set(uploadId, uploadRecord);
    this.hashIndex.set(`${businessId}:${fileHash}`, uploadId);
    this.recordAuditEvent(uploadId, businessId, uploadedBy, 'upload_parsed', uploadId, { filename: fileName, fileHash, candidateCount: 0 });

    const header = this.parseCsvRow(rows[0]);
    const normalizedHeader = header.map((value) => value.trim().toLowerCase());
    const hasDate = normalizedHeader.includes('date') || normalizedHeader.includes('transactiondate');
    const hasDescription = normalizedHeader.includes('description') || normalizedHeader.includes('narration');
    const hasAmount = normalizedHeader.some((value) => ['amount', 'debit', 'credit'].includes(value));
    if (!hasDate || !hasDescription || !hasAmount) {
      const errors = ['CSV must include date, description or narration, and amount, debit, or credit columns.'];
      const upload = this.createRejectedUpload(fileName, businessId, uploadedBy, fileHash, 'BANK_STATEMENT', errors, duplicateUploadRef ?? null);
      this.hashIndex.set(`${businessId}:${fileHash}`, upload.id);
      return { id: `batch-${Date.now()}`, businessId, fileName, source: 'BANK_STATEMENT', uploadedBy, uploadedAt: new Date().toISOString(), status: 'REVIEW', candidates: [], errors: [{ error: errors[0], action: 'REJECT' }] };
    }
    const seen = new Map<string, number>();
    const candidates: UploadCandidate[] = [];
    const errors: Array<{ row?: string; error: string; action: string }> = [];

    for (const [index, rowText] of rows.slice(1).entries()) {
      const row = this.parseCsvRow(rowText);
      if (row.length !== header.length) {
        errors.push({ row: `Row ${index + 2}`, error: 'CSV row has an unexpected number of columns.', action: 'REVIEW' });
        continue;
      }
      const record = Object.fromEntries(header.map((key, i) => [key.toLowerCase(), row[i] ?? '']));
      const date = this.normalizeDate(String(record.date ?? record.transactiondate ?? ''));
      const rawAmount = this.firstNonEmptyString(String(record.amount ?? ''), String(record.debit ?? ''), String(record.credit ?? ''), '0');
      const debit = this.firstNonEmptyString(String(record.debit ?? ''), '', '');
      const credit = this.firstNonEmptyString(String(record.credit ?? ''), '', '');
      const amount = this.normalizeAmount(rawAmount || debit || credit || '0');
      const direction = this.detectDirection(rawAmount || amount, debit, credit);

      if (!this.isValidIsoDate(date) || amount === '0.00' || !this.isValidAmount(rawAmount || debit || credit)) {
        errors.push({ row: `Row ${index + 2}`, error: 'Malformed or empty transaction row.', action: 'REVIEW' });
        continue;
      }

      const description = this.normalizeDescription(String(record.description ?? record.narration ?? 'Bank transaction'));
      const reference = this.normalizeReference(String(record.reference ?? record.description ?? ''));
      const transactionId = this.normalizeReference(String(record.transactionid ?? record.transaction_id ?? record.id ?? ''));
      const signature = this.buildDuplicateSignature({ date, description, amount, reference, accountId: 'bank-account', transactionId });
      const currentCount = seen.get(signature) ?? 0;
      seen.set(signature, currentCount + 1);
      const signatureKey = `${businessId}:${signature}`;
      const priorCandidateId = this.transactionSignatureIndex.get(signatureKey);

      const suggestionType: TransactionSuggestionType = direction === 'CREDIT' ? 'MONEY_IN' : 'MONEY_OUT';
      const accounts = this.resolveSuggestionAccounts();
      const candidate: UploadCandidate = {
        id: `candidate-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        businessId,
        source: 'BANK_STATEMENT',
        raw: { date: String(record.date ?? record.transactiondate ?? ''), description: String(record.description ?? record.narration ?? ''), reference: String(record.reference ?? record.description ?? ''), amount: rawAmount },
        normalized: {
          originalDate: String(record.date ?? record.transactiondate ?? ''),
          date,
          description,
          reference: reference || undefined,
          amount,
          rawAmount,
          direction,
          balance: this.normalizeAmount(String(record.balance ?? '0.00')),
          currency: 'MYR',
          transactionId: transactionId || undefined,
        },
        duplicateStatus: effectiveDuplicateReference ? 'CONFIRMED_DUPLICATE' : currentCount > 0 || priorCandidateId ? 'POSSIBLE_DUPLICATE' : 'NONE',
        status: 'PARSED',
        suggestion: this.suggestionFor(description, {
          type: suggestionType,
          financialAccountId: accounts.bankAccountId,
          accountId: suggestionType === 'MONEY_IN' ? accounts.revenueAccountId : accounts.expenseAccountId,
          amount,
          description,
          referenceNo: reference || undefined,
          date,
        }, businessId),
        confidence: suggestionType === 'MONEY_IN' ? 92 : 88,
        auditTrail: [`Imported ${description}`],
      };
      candidates.push(candidate);
      this.transactionSignatureIndex.set(signatureKey, candidate.id);
    }

    const batch: ImportBatch = {
      id: `batch-${Date.now()}`,
      businessId,
      fileName,
      source: 'BANK_STATEMENT',
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      status: 'REVIEW',
      candidates,
      errors,
    };
    uploadRecord.normalizedData = JSON.stringify(candidates.map((candidate) => candidate.normalized));
    uploadRecord.importIdentifier = `${businessId}:${fileHash}`;
    this.uploads.set(uploadId, uploadRecord);
    this.batches.set(batch.id, batch);
    if (effectiveDuplicateReference) {
      this.recordAuditEvent(uploadId, businessId, uploadedBy, 'duplicate_detected', uploadId, { duplicateReference: effectiveDuplicateReference, candidateCount: candidates.length });
    }
    for (const candidate of candidates) {
      this.recordAuditEvent(uploadId, businessId, uploadedBy, 'mapping_suggested', candidate.id, { description: candidate.suggestion.description, amount: candidate.suggestion.amount, referenceNo: candidate.suggestion.referenceNo ?? '' });
    }
    return batch;
  }

  extractInvoice(input: { businessId: string; sourceType: 'INVOICE' | 'BILL'; rawText: string; uploadedBy: string }): UploadCandidate {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const invoiceRef = /(?:invoice|bill)[^\n]*[:\s]+([A-Z0-9-]+)/i.exec(input.rawText)?.[1] ?? 'INV-UNKNOWN';
    const totalMatch = /(?:total|amount|grand total)[^\d]*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(input.rawText) ?? /RM\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(input.rawText);
    if (!totalMatch) throw new Error('Invoice amount is required.');
    const amount = this.normalizeAmount(totalMatch[1].replace(/,/g, ''));
    const dateMatch = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i.exec(input.rawText);
    if (!dateMatch) throw new Error('Invoice date is required.');
    const date = this.normalizeDate(dateMatch[1]);

    return {
      id: `candidate-${Date.now()}`,
      businessId: input.businessId,
      source: 'INVOICE',
      raw: { description: input.rawText },
      normalized: {
        date,
        description: `Invoice ${invoiceRef}`,
        reference: invoiceRef,
        amount,
        rawAmount: amount,
        direction: 'CREDIT',
        currency: 'MYR',
      },
      duplicateStatus: 'NONE',
      status: 'PARSED',
      suggestion: {
        type: 'MONEY_IN',
        financialAccountId: this.resolveSuggestionAccounts().bankAccountId,
        accountId: this.resolveSuggestionAccounts().revenueAccountId,
        amount,
        description: `Customer invoice ${invoiceRef}`,
        referenceNo: invoiceRef,
        date,
      },
      confidence: 88,
      auditTrail: [`Extracted invoice ${invoiceRef}`, this.resolveSuggestionAccounts().bankAccountId && this.resolveSuggestionAccounts().revenueAccountId ? 'PERSISTENCE_READY' : 'PERSISTENCE_NOT_AVAILABLE'],
    };
  }

  extractReceipt(input: { businessId: string; sourceType: 'RECEIPT'; rawText: string; uploadedBy: string }): UploadCandidate {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const receiptRef = /(?:receipt|rct)[^\n]*[:\s]+([A-Z0-9-]+)/i.exec(input.rawText)?.[1] ?? 'RCP-UNKNOWN';
    const totalMatch = /(?:total|amount|grand total)[^\d]*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(input.rawText) ?? /RM\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i.exec(input.rawText);
    if (!totalMatch) throw new Error('Receipt amount is required.');
    const amount = this.normalizeAmount(totalMatch[1].replace(/,/g, ''));
    const dateMatch = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i.exec(input.rawText);
    if (!dateMatch) throw new Error('Receipt date is required.');
    const date = this.normalizeDate(dateMatch[1]);

    return {
      id: `candidate-${Date.now()}`,
      businessId: input.businessId,
      source: 'RECEIPT',
      raw: { description: input.rawText },
      normalized: {
        date,
        description: `Receipt ${receiptRef}`,
        reference: receiptRef,
        amount,
        rawAmount: amount,
        direction: 'DEBIT',
        currency: 'MYR',
      },
      duplicateStatus: 'NONE',
      status: 'PARSED',
      suggestion: {
        type: 'MONEY_OUT',
        financialAccountId: this.resolveSuggestionAccounts().bankAccountId,
        accountId: this.resolveSuggestionAccounts().expenseAccountId,
        amount,
        description: `Business receipt ${receiptRef}`,
        referenceNo: receiptRef,
        date,
      },
      confidence: 86,
      auditTrail: [`Extracted receipt ${receiptRef}`, this.resolveSuggestionAccounts().bankAccountId && this.resolveSuggestionAccounts().expenseAccountId ? 'PERSISTENCE_READY' : 'PERSISTENCE_NOT_AVAILABLE'],
    };
  }

  approveCandidate(candidateId: string, actor: string): UploadCandidate {
    const batch = [...this.batches.values()].find((entry) => entry.candidates.some((candidate) => candidate.id === candidateId));
    const candidate = batch?.candidates.find((entry) => entry.id === candidateId);
    if (!candidate) {
      throw new Error('Candidate not found.');
    }
    if (candidate.duplicateStatus !== 'NONE') {
      throw new Error('Duplicate candidates require manual review before approval.');
    }
    if (!this.allowTransition(candidate.status, 'APPROVED')) {
      throw new Error(`Invalid candidate transition from ${candidate.status} to APPROVED.`);
    }
    const approved: UploadCandidate = {
      ...candidate,
      status: 'APPROVED',
      auditTrail: [...(candidate.auditTrail ?? []), `${actor} approved ${candidate.suggestion.type}`],
    };
    if (batch) {
      batch.candidates = batch.candidates.map((entry) => entry.id === candidateId ? approved : entry);
      batch.status = 'APPROVED';
    }
    const upload = [...this.uploads.values()].find((entry) => entry.businessId === candidate.businessId && entry.filename === batch?.fileName);
    if (upload) {
      this.recordAuditEvent(upload.id, candidate.businessId, actor, 'upload_approved', candidateId, { status: 'APPROVED', amount: candidate.suggestion.amount, description: candidate.suggestion.description });
      this.updateUploadStatus(upload.id, candidate.businessId, 'APPROVED', actor, 'Candidate approved through upload workflow');
    }
    return approved;
  }

  postApprovedCandidate(candidateId: string, actor: string, businessId: string): TransactionRecord {
    const batch = [...this.batches.values()].find((entry) => entry.businessId === businessId && entry.candidates.some((candidate) => candidate.id === candidateId));
    const candidate = batch?.candidates.find((entry) => entry.id === candidateId);
    if (!candidate) {
      throw new Error('Approved candidate not found.');
    }

    const idempotencyKey = `upload-${candidate.id}`;
    const cached = this.idempotency.get(idempotencyKey);
    if (cached) {
      return cached;
    }

    if (candidate.status === 'POSTED') {
      const existing = this.transactionService.getTransactions(businessId).find((entry) => entry.referenceNo === candidate.suggestion.referenceNo && entry.amount === candidate.suggestion.amount && entry.description === candidate.suggestion.description) ?? cached;
      if (!existing) {
        throw new Error('Posted upload candidate could not be resolved from the transaction ledger.');
      }
      return existing;
    }

    if (candidate.status !== 'APPROVED') {
      const upload = [...this.uploads.values()].find((entry) => entry.businessId === businessId && entry.filename === batch?.fileName);
      if (upload) {
        this.recordAuditEvent(upload.id, businessId, actor, 'upload_post_failed', candidateId, { reason: 'Only approved candidates can be posted.', status: candidate.status });
      }
      throw new Error('Only approved candidates can be posted.');
    }

    try {
      const transaction = this.transactionService.createTransaction({
        businessId,
        type: candidate.suggestion.type,
        date: candidate.suggestion.date,
        description: candidate.suggestion.description,
        amount: candidate.suggestion.amount,
        referenceNo: candidate.suggestion.referenceNo,
        financialAccountId: candidate.suggestion.financialAccountId,
        accountId: candidate.suggestion.accountId,
        createdBy: actor,
        idempotencyKey,
      });

      const posted = this.transactionService.postTransaction(transaction.id, actor, idempotencyKey);
      candidate.status = 'POSTED';
      candidate.auditTrail = [...(candidate.auditTrail ?? []), `${actor} posted ${posted.journalId ?? 'journal'}`];
      this.idempotency.set(idempotencyKey, posted);
      const upload = [...this.uploads.values()].find((entry) => entry.businessId === businessId && entry.filename === batch?.fileName);
      if (upload) {
        this.recordAuditEvent(upload.id, businessId, actor, 'upload_posted', candidateId, { journalId: posted.journalId ?? '', amount: candidate.suggestion.amount });
        this.updateUploadStatus(upload.id, businessId, 'POSTED', actor, 'Upload candidate posted to accounting');
      }
      return posted;
    } catch (error) {
      const upload = [...this.uploads.values()].find((entry) => entry.businessId === businessId && entry.filename === batch?.fileName);
      if (upload) {
        this.recordAuditEvent(upload.id, businessId, actor, 'upload_post_failed', candidateId, { reason: (error as Error).message || 'Posting failed', amount: candidate.suggestion.amount });
      }
      throw error;
    }
  }

  private parseCsvRow(row: string): string[] {
    const values: string[] = [];
    let buffer = '';
    let insideQuotes = false;

    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        if (insideQuotes && row[i + 1] === '"') {
          buffer += '"';
          i += 1;
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

  private normalizeDescription(value: string): string {
    return value.replace(/\s+/g, ' ').replace(/\s*[-|/]+\s*/g, ' ').trim();
  }

  private normalizeReference(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizeDate(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    const asDate = new Date(trimmed);
    if (!Number.isNaN(asDate.getTime())) {
      return asDate.toISOString().slice(0, 10);
    }

    const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) {
      const [, day, month, year] = match;
      const normalizedYear = year.length === 2 ? `20${year}` : year;
      const parsed = new Date(`${normalizedYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }

    return trimmed;
  }

  private normalizeAmount(value: string): string {
    const cleaned = String(value ?? '0').replace(/[RM\s,]/gi, '').replace(/[^0-9.-]/g, '');
    const asNumber = Number(cleaned || '0');
    return Number.isFinite(asNumber) ? new DecimalMoney(asNumber).toString() : '0.00';
  }

  private isValidAmount(value: string): boolean {
    const cleaned = String(value ?? '').replace(/[RM\s,]/gi, '');
    return /^-?\d+(?:\.\d{1,2})?$/.test(cleaned) && new DecimalMoney(cleaned).isPositive();
  }

  private isValidIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  private detectDirection(value: string, debit?: string, credit?: string): 'DEBIT' | 'CREDIT' {
    if (debit && !credit) return 'DEBIT';
    if (credit && !debit) return 'CREDIT';
    const numeric = Number(this.normalizeAmount(value));
    return numeric < 0 ? 'DEBIT' : 'CREDIT';
  }

  private firstNonEmptyString(...values: Array<string | undefined>): string {
    return values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? '';
  }
}
