import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase } from '@/lib/db';
import { Account } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const db = getDatabase();

    const newAccount: Account = {
      id: `acc-${Date.now()}`,
      name: data.name,
      provider: data.provider || data.name,
      account_type: data.account_type || 'bank',
      currency: data.currency || 'IDR',
      current_balance: Number(data.current_balance) || 0,
      is_active: true,
      last_synced_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    db.accounts.push(newAccount);
    saveDatabase(db);

    return NextResponse.json({ success: true, account: newAccount });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const db = getDatabase();

    const account = db.accounts.find(a => a.id === data.id);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (data.name !== undefined) account.name = data.name;
    if (data.current_balance !== undefined) account.current_balance = Number(data.current_balance);
    if (data.is_active !== undefined) account.is_active = Boolean(data.is_active);
    account.last_synced_at = new Date().toISOString();

    saveDatabase(db);
    return NextResponse.json({ success: true, account });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
