import { NextResponse } from 'next/server';
import {
  getDefaultAdvanceTemplate,
  updateDefaultAdvanceTemplate,
} from '@/lib/advance';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

export async function GET() {
  const template = await getDefaultAdvanceTemplate();
  return NextResponse.json(template);
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const templateBody = typeof body?.body === 'string' ? body.body : '';
  if (!subject || !templateBody.trim()) {
    return NextResponse.json(
      { error: 'Subject and body are both required.' },
      { status: 400 }
    );
  }
  const template = await updateDefaultAdvanceTemplate({
    subject,
    body: templateBody,
  });
  return NextResponse.json(template);
}
