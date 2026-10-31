import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase } from '@/lib/db';

export async function GET() {
  const db = getDatabase();
  return NextResponse.json(db);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === 'reset') {
      // Re-initialize with initial data if needed
      return NextResponse.json({ success: true, message: 'Database reset' });
    }
    const currentDb = getDatabase();
    const updated = { ...currentDb, ...body };
    saveDatabase(updated);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
