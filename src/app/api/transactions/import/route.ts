import { NextResponse } from 'next/server';
import { getDatabase, saveDatabase, withDbLock, createBackup, sanitizeError } from '@/lib/db';
import { Transaction, TransactionType } from '@/lib/types';

export async function POST(req: Request) {
  return withDbLock(async () => {
    try {
      const { csvData, accountId } = await req.json();
      if (!csvData || !accountId) {
        return NextResponse.json({ success: false, error: 'Data CSV dan akun tujuan wajib disertakan.' }, { status: 400 });
      }

      const db = getDatabase();
      const account = db.accounts.find((a) => a.id === accountId);
      if (!account) {
        return NextResponse.json({ success: false, error: 'Akun tidak ditemukan di database.' }, { status: 404 });
      }

      const lines = csvData.trim().split(/\r?\n/);
      if (lines.length < 2) {
        return NextResponse.json({ success: false, error: 'Berkas CSV kosong atau tidak memiliki header.' }, { status: 400 });
      }

      // Buat backup pengaman sebelum impor massal
      createBackup('pre-csv-import');

      const existingExternalIds = new Set(
        db.transactions
          .filter((t) => t.account_id === accountId && t.external_transaction_id)
          .map((t) => t.external_transaction_id)
      );

      const importedTransactions: Transaction[] = [];
      let duplicatesSkipped = 0;
      let balanceDelta = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',').map((c: string) => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 3) continue;

        const rawDate = cols[0];
        const desc = cols[1];
        const rawAmount = cols[2];
        const rawType = cols[3]?.toLowerCase() || '';
        const refNo = cols[4] || `imp-${rawDate}-${desc.substring(0, 8)}-${rawAmount}`;

        if (existingExternalIds.has(refNo)) {
          duplicatesSkipped++;
          continue;
        }

        const numAmount = Math.abs(parseFloat(rawAmount.replace(/[^0-9.-]+/g, '')) || 0);
        if (numAmount === 0 || isNaN(numAmount)) continue;

        let txType: TransactionType = 'expense';
        const isDebit = rawType.includes('db') || rawType.includes('debit') || rawType.includes('keluar');
        const isCredit = rawType.includes('cr') || rawType.includes('in') || rawType.includes('kredit') || rawType.includes('masuk');
        if (isCredit) {
          txType = 'income';
        } else if (isDebit) {
          txType = 'expense';
        } else {
          txType = parseFloat(rawAmount) < 0 ? 'expense' : 'income';
        }

        let parsedDateStr = new Date().toISOString();
        try {
          const dmyMatch = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
          if (dmyMatch) {
            const parsed = new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
            if (!isNaN(parsed.getTime())) parsedDateStr = parsed.toISOString();
          } else {
            const d = new Date(rawDate);
            if (!isNaN(d.getTime())) parsedDateStr = d.toISOString();
          }
        } catch {
          parsedDateStr = new Date().toISOString();
        }

        const newTx: Transaction = {
          id: `tx-imp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          account_id: accountId,
          external_transaction_id: refNo,
          transaction_date: parsedDateStr,
          description: desc || 'Impor Mutasi',
          amount: numAmount,
          transaction_type: txType,
          source: 'csv_import',
          created_at: new Date().toISOString(),
        };

        existingExternalIds.add(refNo);
        importedTransactions.push(newTx);

        if (txType === 'income') {
          balanceDelta += numAmount;
        } else {
          balanceDelta -= numAmount;
        }
      }

      const initialBalance = account.current_balance;
      account.current_balance += balanceDelta;
      account.last_synced_at = new Date().toISOString();

      db.transactions.unshift(...importedTransactions);
      db.sync_logs.unshift({
        id: `log-${Date.now()}`,
        source: `CSV Import (${account.provider})`,
        status: 'success',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        records_synced: importedTransactions.length,
      });

      const saved = saveDatabase(db);
      if (!saved) {
        account.current_balance = initialBalance;
        db.transactions.splice(0, importedTransactions.length);
        db.sync_logs.shift();
        return NextResponse.json({ success: false, error: 'Gagal menyimpan transaksi impor ke database lokal.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        importedCount: importedTransactions.length,
        duplicatesSkipped,
        newBalance: account.current_balance,
      });
    } catch (error) {
      return NextResponse.json({ success: false, error: sanitizeError(error) }, { status: 500 });
    }
  });
}
