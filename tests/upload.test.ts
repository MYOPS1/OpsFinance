import { describe, expect, it } from 'vitest';

import { AccountingEngine } from '../packages/accounting';
import { isAllowedImportTransition, validateCsvBankStatement } from '../packages/csv-import';
import { ReconciliationService } from '../packages/reconciliation';
import { UploadConvertService } from '../packages/upload';

describe('Phase 7 upload and convert hardening', () => {
  it('validates quoted CSV rows and deterministic transition rules', () => {
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,"Customer, payment",INV-1001,,500.00,5000.00\n2026-09-16,"Petrol, purchase",PO-2041,120.00,,4880.00';

    const validation = validateCsvBankStatement(csv);
    expect(validation.isValid).toBe(true);
    expect(validation.rowCount).toBe(3);
    expect(isAllowedImportTransition('PARSED', 'APPROVED')).toBe(true);
    expect(isAllowedImportTransition('APPROVED', 'PARSED')).toBe(false);
    expect(isAllowedImportTransition('POSTED', 'APPROVED')).toBe(false);
  });

  it('rejects malformed CSV rows and row limit breaches before parsing', () => {
    const malformed = validateCsvBankStatement('Date,Description,Reference\n2026-09-12,"Customer payment",INV-1001\n2026-09-16,Petrol');
    expect(malformed.isValid).toBe(false);
    expect(malformed.errors.some((error) => error.includes('malformed'))).toBe(true);

    const rows = Array.from({ length: 4 }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')},Row ${index + 1},INV-${index + 1},,100.00,1000.00`).join('\n');
    const limited = validateCsvBankStatement(`Date,Description,Reference,Debit,Credit,Balance\n${rows}`, { maxRows: 2, maxBytes: 1_000_000 });
    expect(limited.isValid).toBe(false);
    expect(limited.errors.some((error) => error.includes('maximum row limit'))).toBe(true);
  });

  const businessId = '11111111-1111-4111-8111-111111111111';
  const otherBusinessId = '22222222-2222-4222-8222-222222222222';
  const bankAccountId = '33333333-3333-4333-8333-333333333333';
  const revenueAccountId = '44444444-4444-4444-8444-444444444444';
  const expenseAccountId = '55555555-5555-4555-8555-555555555555';
  const cashAccountId = '66666666-6666-4666-8666-666666666666';

  const engine = new AccountingEngine({
    businessId,
    accounts: [
      { id: revenueAccountId, businessId, code: '4000', name: 'Sales', accountType: 'REVENUE', normalBalance: 'CREDIT', isSystem: false, isActive: true },
      { id: expenseAccountId, businessId, code: '6000', name: 'Petrol', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: false, isActive: true },
      { id: cashAccountId, businessId, code: '1100', name: 'Cash', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: false, isActive: true },
    ],
    periods: [{ id: 'period-1', businessId, name: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30', status: 'OPEN' }],
    financialAccounts: [{ id: bankAccountId, businessId, name: 'Maybank', type: 'BANK', accountCode: 'MAYBANK', currency: 'MYR', status: 'ACTIVE' }],
  });

  it('validates supported files and rejects unsafe names or MIME mismatches', () => {
    const service = new UploadConvertService(engine);

    expect(service.validateFile({ name: 'bank.csv', size: 2048, type: 'text/csv' }).isValid).toBe(true);
    expect(service.validateFile({ name: 'invoice.pdf', size: 4096, type: 'application/pdf' }).isValid).toBe(true);
    expect(service.validateFile({ name: 'receipt.webp', size: 4096, type: 'image/webp' }).isValid).toBe(true);
    expect(service.validateFile({ name: 'bad.exe', size: 2048, type: 'application/x-msdownload' }).isValid).toBe(false);
    expect(service.validateFile({ name: '../unsafe.csv', size: 2048, type: 'text/csv' }).isValid).toBe(false);
    expect(service.validateFile({ name: 'mismatch.pdf', size: 2048, type: 'image/png' }).isValid).toBe(false);
  });

  it('rejects malformed, empty and oversized uploads and stores the upload record', () => {
    const service = new UploadConvertService(engine);
    const empty = service.validateFile({ name: 'empty.csv', size: 0, type: 'text/csv' });
    expect(empty.isValid).toBe(false);

    const oversized = service.validateFile({ name: 'oversized.csv', size: 11 * 1024 * 1024, type: 'text/csv' });
    expect(oversized.isValid).toBe(false);

    const batch = service.processBankStatementCsv('Date,Description\n2026-09-12,Missing amount', 'bad.csv', businessId, 'user-1');
    expect(batch.errors.length).toBeGreaterThan(0);

    const uploads = service.listUploads(businessId);
    expect(uploads.length).toBeGreaterThan(0);
    expect(uploads[0].fileHash).toBeTruthy();
  });

  it('detects duplicate files and duplicate bank transactions before approval', () => {
    const service = new UploadConvertService(engine);
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-1001,,500.00,5000.00\n2026-09-12,Customer payment,INV-1001,,500.00,5000.00';

    const first = service.processBankStatementCsv(csv, 'duplicate.csv', businessId, 'user-1');
    const second = service.processBankStatementCsv(csv, 'duplicate.csv', businessId, 'user-1');

    expect(first.candidates.every((candidate) => candidate.duplicateStatus !== 'CONFIRMED_DUPLICATE')).toBe(true);
    expect(second.candidates.some((candidate) => candidate.duplicateStatus === 'CONFIRMED_DUPLICATE')).toBe(true);
    expect(() => service.approveCandidate(second.candidates[0].id, 'user-1')).toThrow();
  });

  it('treats the same file hash as a true duplicate only on the second upload while preserving the original upload', () => {
    const service = new UploadConvertService(engine);
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-1030,,900.00,7000.00';

    const first = service.processBankStatementCsv(csv, 'duplicate-file.csv', businessId, 'user-1');
    const firstUpload = service.listUploads(businessId).find((record) => record.filename === 'duplicate-file.csv' && record.fileHash === service['generateFileHash'](csv));
    expect(first.candidates[0].duplicateStatus).toBe('NONE');
    expect(firstUpload?.status).toBe('PARSED');

    const second = service.processBankStatementCsv(csv, 'duplicate-file.csv', businessId, 'user-1');
    const secondUpload = service.listUploads(businessId).find((record) => record.filename === 'duplicate-file.csv' && record.fileHash === firstUpload?.fileHash && record.duplicateReference === firstUpload?.id);

    expect(second.candidates[0].duplicateStatus).toBe('CONFIRMED_DUPLICATE');
    expect(secondUpload?.duplicateReference).toBe(firstUpload?.id);
    expect(firstUpload?.status).toBe('PARSED');
    expect(() => service.approveCandidate(second.candidates[0].id, 'user-1')).toThrow();
  });

  it('extracts invoice and receipt data for review before posting', () => {
    const service = new UploadConvertService(engine);

    const invoice = service.extractInvoice({
      businessId,
      sourceType: 'INVOICE',
      rawText: 'Supplier: ACME Ltd\nInvoice: INV-9001\nDate: 2026-09-05\nDue: 2026-09-20\nTotal: RM2000.00\nTax: RM160.00\nSubtotal: RM1840.00',
      uploadedBy: 'user-1',
    });

    const receipt = service.extractReceipt({
      businessId,
      sourceType: 'RECEIPT',
      rawText: 'Merchant: Shell\nDate: 2026-09-18\nReceipt: RPT-978\nTotal: RM300.00\nPayment: CARD',
      uploadedBy: 'user-1',
    });

    expect(invoice.suggestion.type).toBe('MONEY_IN');
    expect(invoice.normalized.amount).toBe('2000.00');
    expect(receipt.suggestion.type).toBe('MONEY_OUT');
    expect(receipt.normalized.amount).toBe('300.00');
  });

  it('posts uploaded bank statements through the real accounting boundary', () => {
    const service = new UploadConvertService(engine);
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-1001,,500.00,5000.00';
    const batch = service.processBankStatementCsv(csv, 'bank-upload.csv', businessId, 'user-1');
    expect(batch.candidates.length).toBe(1);

    const beforeJournalCount = [...(engine as any).journals.values()].length;
    const approved = service.approveCandidate(batch.candidates[0].id, 'user-1');
    expect(approved.status).toBe('APPROVED');

    const posted = service.postApprovedCandidate(batch.candidates[0].id, 'user-1', businessId);
    expect(posted).toHaveProperty('journalId');
    expect((engine as any).journals.size).toBeGreaterThan(beforeJournalCount);

    const ledger = engine.getLedger({ businessId, accountId: revenueAccountId, startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(ledger.entries.length).toBeGreaterThan(0);
    expect(ledger.balance).toBe('500.00');
  });

  it('integrates uploaded bank transactions with the existing reconciliation service', () => {
    const service = new UploadConvertService(engine);
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-14,Customer payment,INV-2001,,250.00,1500.00';
    const batch = service.processBankStatementCsv(csv, 'recon-upload.csv', businessId, 'user-1');
    const bankTx = {
      id: 'bank-upload-1',
      statementId: 'stmt-upload-1',
      businessId,
      financialAccountId: bankAccountId,
      date: batch.candidates[0].normalized.date,
      description: batch.candidates[0].normalized.description,
      normalizedDescription: batch.candidates[0].normalized.description.toLowerCase(),
      reference: batch.candidates[0].normalized.reference ?? 'INV-2001',
      debit: '',
      credit: batch.candidates[0].normalized.amount,
      amount: batch.candidates[0].normalized.amount,
      balance: '1500.00',
      direction: 'CREDIT' as const,
      source: 'csv',
      status: 'IMPORTED' as const,
    };

    const reconciliation = new ReconciliationService(engine);
    reconciliation.createStatement({
      id: 'stmt-upload-1',
      businessId,
      financialAccountId: bankAccountId,
      name: 'Uploaded statement',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      openingBalance: '1000.00',
      closingBalance: '1500.00',
    });
    const session = reconciliation.createSession({
      id: 'session-upload-1',
      businessId,
      financialAccountId: bankAccountId,
      statementId: 'stmt-upload-1',
      actor: 'user-1',
    });

    reconciliation.addBankTransactions('stmt-upload-1', [bankTx]);
    reconciliation.addBookTransactions([{
      id: 'book-upload-1',
      businessId,
      financialAccountId: bankAccountId,
      date: batch.candidates[0].normalized.date,
      description: batch.candidates[0].normalized.description,
      referenceNo: batch.candidates[0].normalized.reference ?? 'INV-2001',
      amount: batch.candidates[0].normalized.amount,
      type: 'MONEY_IN',
      status: 'POSTED',
      journalId: 'journal-upload-1',
    }]);

    const match = reconciliation.matchTransaction(session.id, 'bank-upload-1', 'book-upload-1', 'user-1');
    expect(match.status).toBe('MATCHED');
    expect(match.amount).toBe('250.00');
  });

  it('supports retry and reprocess without duplicating accounting effects', () => {
    const service = new UploadConvertService(engine);
    const failedParse = service.createUploadRecord({
      name: 'retry.csv',
      size: 128,
      type: 'text/csv',
      content: 'Date,Description\n2026-09-12,Missing amount',
    }, businessId, 'user-1', 'BANK_STATEMENT');

    const retryResult = service.retryParseUpload(failedParse.id, businessId, 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-9999,,125.00,1000.00');
    expect(retryResult.errors).toEqual([]);
    expect(retryResult.candidates.length).toBe(1);
    expect(retryResult.candidates[0].status).toBe('PARSED');

    const candidate = retryResult.candidates[0];
    const mapped = service.updateCandidateMapping(candidate.id, {
      accountId: revenueAccountId,
      financialAccountId: bankAccountId,
      description: 'Customer payment updated',
      referenceNo: 'INV-9999',
      amount: '125.00',
    });
    expect(mapped.status).toBe('MAPPED');

    const approved = service.approveCandidate(candidate.id, 'user-1');
    expect(approved.status).toBe('APPROVED');

    const posted = service.postApprovedCandidate(candidate.id, 'user-1', businessId);
    expect(posted).toHaveProperty('journalId');

    const duplicatePosted = service.postApprovedCandidate(candidate.id, 'user-1', businessId);
    expect(duplicatePosted.id).toBe(posted.id);
  });

  it('records upload_rejected, post failure, and reprocess to a successful final posting without duplicate effects', () => {
    const service = new UploadConvertService(engine);
    const rejectedBatch = service.processBankStatementCsv('', 'reject-me.csv', businessId, 'user-1');
    expect(rejectedBatch.errors.length).toBeGreaterThan(0);
    expect(rejectedBatch.candidates).toEqual([]);

    const rejectedUpload = service.listUploads(businessId).find((record) => record.filename === 'reject-me.csv');
    expect(rejectedUpload?.status).toBe('REJECTED');
    expect(service.getUploadAuditTrail(rejectedUpload!.id, businessId).some((event) => event.event === 'upload_rejected')).toBe(true);

    const validCsv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-4001,,820.00,9000.00';
    const retryResult = service.retryParseUpload(rejectedUpload!.id, businessId, validCsv);
    const candidate = retryResult.candidates[0];
    const mapped = service.updateCandidateMapping(candidate.id, {
      accountId: revenueAccountId,
      financialAccountId: bankAccountId,
      description: 'Retry successful',
      referenceNo: 'INV-4001',
      amount: '820.00',
    });
    const approved = service.approveCandidate(mapped.id, 'user-1');

    const journalCountBefore = [...(engine as any).journals.values()].length;
    const posted = service.postApprovedCandidate(approved.id, 'user-1', businessId);
    const journalCountAfter = [...(engine as any).journals.values()].length;

    expect(posted).toHaveProperty('journalId');
    expect(journalCountAfter).toBeGreaterThan(journalCountBefore);
    expect(service.getUploadAuditTrail(rejectedUpload!.id, businessId).some((event) => event.event === 'upload_reprocessed')).toBe(true);
    expect(service.getUploadAuditTrail(rejectedUpload!.id, businessId).some((event) => event.event === 'upload_posted')).toBe(true);
  });

  it('records upload lifecycle audit events and preserves raw input values', () => {
    const service = new UploadConvertService(engine);
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-1010,,750.00,5000.00';
    const record = service.createUploadRecord({ name: 'audit.csv', size: csv.length, type: 'text/csv', content: csv }, businessId, 'user-1', 'BANK_STATEMENT');
    const batch = service.processBankStatementCsv(csv, 'audit.csv', businessId, 'user-1');
    const candidate = batch.candidates[0];

    expect(service.getUploadAuditTrail(record.id, businessId).some((event) => event.event === 'upload_created')).toBe(true);
    expect(service.getUploadAuditTrail(record.id, businessId).some((event) => event.event === 'upload_parsed')).toBe(true);
    expect(service.getUploadAuditTrail(record.id, businessId).some((event) => event.event === 'mapping_suggested')).toBe(true);

    service.updateCandidateMapping(candidate.id, {
      accountId: revenueAccountId,
      financialAccountId: bankAccountId,
      description: 'Customer payment updated',
      referenceNo: 'INV-1010',
      amount: '750.00',
    });
    service.approveCandidate(candidate.id, 'user-1');
    const posted = service.postApprovedCandidate(candidate.id, 'user-1', businessId);

    const auditEvents = service.getUploadAuditTrail(record.id, businessId).map((event) => event.event);
    const createdIndex = auditEvents.indexOf('upload_created');
    const parsedIndex = auditEvents.indexOf('upload_parsed');
    const suggestedIndex = auditEvents.indexOf('mapping_suggested');
    const editedIndex = auditEvents.indexOf('mapping_edited');
    const approvedIndex = auditEvents.indexOf('upload_approved');
    const postedIndex = auditEvents.indexOf('upload_posted');

    expect(createdIndex).toBeGreaterThanOrEqual(0);
    expect(parsedIndex).toBeGreaterThan(createdIndex);
    expect(suggestedIndex).toBeGreaterThan(parsedIndex);
    expect(editedIndex).toBeGreaterThan(suggestedIndex);
    expect(approvedIndex).toBeGreaterThan(editedIndex);
    expect(postedIndex).toBeGreaterThan(approvedIndex);

    expect(auditEvents.includes('mapping_edited')).toBe(true);
    expect(auditEvents.includes('upload_approved')).toBe(true);
    expect(auditEvents.includes('upload_posted')).toBe(true);
    expect(posted).toHaveProperty('journalId');
    expect(candidate.raw.description).toBe('Customer payment');
    expect(candidate.raw.amount).toBe('750.00');
    expect(candidate.normalized.amount).toBe('750.00');
  });

  it('enforces upload lifecycle transitions and idempotent approval and posting', () => {
    const service = new UploadConvertService(engine);
    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,Customer payment,INV-2022,,600.00,5000.00';
    const batch = service.processBankStatementCsv(csv, 'lifecycle.csv', businessId, 'user-1');
    const candidate = batch.candidates[0];

    expect(() => service.transitionUploadStatus(candidate.id, businessId, 'POSTED')).toThrow();
    expect(service.updateCandidateStatus(candidate.id, 'REVIEW').status).toBe('REVIEW');
    expect(service.approveCandidate(candidate.id, 'user-1').status).toBe('APPROVED');
    const firstPost = service.postApprovedCandidate(candidate.id, 'user-1', businessId);
    const secondPost = service.postApprovedCandidate(candidate.id, 'user-1', businessId);
    expect(secondPost.id).toBe(firstPost.id);
  });

  it('blocks cross-business access to uploads and records', () => {
    const service = new UploadConvertService(engine);
    const upload = service.createUploadRecord({
      name: 'bank.csv',
      size: 2048,
      type: 'text/csv',
      content: 'Date,Description,Reference,Debit,Credit\n2026-09-12,Customer payment,INV-1001,,500.00',
    }, businessId, 'user-1', 'BANK_STATEMENT');

    expect(() => service.getUploadRecord(upload.id, otherBusinessId)).toThrow();
    expect(() => service.listUploads(otherBusinessId)).toThrow();
    expect(() => service.getUploadAuditTrail(upload.id, otherBusinessId)).toThrow();
  });

  it('rejects invalid dates and preserves raw, normalized, and import metadata', () => {
    const service = new UploadConvertService(engine);
    const malformed = service.processBankStatementCsv(
      'Date,Description,Reference,Debit,Credit,Balance\n2026-99-40,Payment,REF-1,,25.00,100.00',
      'invalid-date.csv',
      businessId,
      'user-1',
    );
    expect(malformed.candidates).toHaveLength(0);
    expect(malformed.errors[0].error).toContain('Malformed');

    const csv = 'Date,Description,Reference,Debit,Credit,Balance\n2026-09-12,  Customer   payment  ,REF-2,,25.00,100.00';
    const batch = service.processBankStatementCsv(csv, 'metadata.csv', businessId, 'user-1');
    const upload = service.listUploads(businessId).find((record) => record.filename === 'metadata.csv');
    expect(upload?.businessId).toBe(businessId);
    expect(upload?.rawData).toBe(csv);
    expect(upload?.normalizedData).toContain('Customer payment');
    expect(upload?.importIdentifier).toContain(businessId);
    expect(batch.candidates[0].raw.description).toContain('Customer');
    expect(batch.candidates[0].normalized.description).toBe('Customer payment');
  });
});
