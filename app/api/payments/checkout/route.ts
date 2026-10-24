import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Standalone accounting mode disables subscription checkout and payment processing.',
    },
    { status: 410 },
  );
}
