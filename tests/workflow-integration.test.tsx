import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciliationWorkflow } from '../components/reconciliation-workflow';
import { UploadWorkflow } from '../components/upload-workflow';

describe('workflow integration', () => {
  it('renders the upload workflow and the review-first upload preview', async () => {
    render(<UploadWorkflow businessId="biz-1" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Upload & Convert' })).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Parse & review' })).toBeTruthy();
  });

  it('renders the reconciliation workflow with a demo statement summary', async () => {
    render(<ReconciliationWorkflow businessId="biz-1" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bank Reconciliation' })).toBeTruthy();
    });

    expect(screen.getByText('Statement summary')).toBeTruthy();
    expect(screen.getAllByText(/RM\d+\.\d{2}/).length).toBeGreaterThan(0);
  });
});
