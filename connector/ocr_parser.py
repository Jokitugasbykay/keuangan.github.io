"""
Local Python OCR Parser for Kayla Finance
Menggunakan RapidOCR (ONNX Runtime) - 100% lokal, offline, tanpa API key.
"""

import sys
import os
import json
import re
from datetime import datetime

# Indonesian month mapping
MONTH_NAMES = {
    'januari': 1, 'jan': 1,
    'februari': 2, 'feb': 2,
    'maret': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'mei': 5, 'may': 5,
    'juni': 6, 'jun': 6,
    'juli': 7, 'jul': 7,
    'agustus': 8, 'agu': 8, 'ags': 8, 'aug': 8,
    'september': 9, 'sep': 9,
    'oktober': 10, 'okt': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'desember': 12, 'des': 12, 'dec': 12
}

BANK_PROVIDERS = [
    ('Mandiri', ['mandiri', 'livin']),
    ('BCA', ['bca', 'mybca', 'klikbca']),
    ('blu', ['blu', 'bca digital']),
    ('BTN', ['btn', 'balé']),
    ('BRI', ['bri', 'brimo']),
    ('BNI', ['bni', 'wondr']),
    ('BSI', ['bsi']),
    ('GoPay', ['gopay', 'gojek']),
    ('OVO', ['ovo']),
    ('DANA', ['dana']),
    ('ShopeePay', ['shopeepay', 'spay']),
    ('Mayar', ['mayar']),
    ('QRIS', ['qris'])
]

def clean_amount(raw_str):
    """Konversi string angka ke float nominal (format Indonesia / Internasional)."""
    if raw_str is None:
        return None
    s = re.sub(r'[^0-9,.]', '', str(raw_str)).strip()
    if not s or s in ('.', ',', '.-', '-.'):
        return None

    # Jika ada koma dan titik: tentukan mana ribuan dan mana desimal
    if '.' in s and ',' in s:
        last_dot = s.rfind('.')
        last_comma = s.rfind(',')
        if last_comma > last_dot:
            # Format Indonesia / Eropa: 25.000.000,00
            s = s.replace('.', '').replace(',', '.')
        else:
            # Format US / Internasional: 25,000,000.00
            s = s.replace(',', '')
    elif '.' in s and not ',' in s:
        parts = s.split('.')
        if len(parts) > 2:
            s = s.replace('.', '')
        elif len(parts[-1]) == 3:
            s = s.replace('.', '')
        elif len(parts[-1]) == 2:
            pass
        else:
            s = s.replace('.', '')
    elif ',' in s and not '.' in s:
        parts = s.split(',')
        if len(parts) > 2:
            s = s.replace(',', '')
        elif len(parts[-1]) == 3:
            s = s.replace(',', '')
        elif len(parts[-1]) == 2:
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    try:
        val = float(s)
        return val if val >= 0 else None
    except ValueError:
        return None

def extract_date(text):
    """Mencari tanggal dalam format Indonesia atau standar (YYYY-MM-DD atau DD/MM/YYYY)."""
    # 1. Format: 25 Oktober 2026 atau 25 Okt 2026
    month_pattern = '|'.join(MONTH_NAMES.keys())
    regex_indo = rf'\b(\d{{1,2}})\s+({month_pattern})\s+(\d{{4}}|\d{{2}})\b'
    m = re.search(regex_indo, text, re.IGNORECASE)
    if m:
        day = int(m.group(1))
        month = MONTH_NAMES.get(m.group(2).lower(), 1)
        year = int(m.group(3))
        if year < 100:
            year += 2000
        try:
            return f"{year:04d}-{month:02d}-{day:02d}"
        except:
            pass

    # 2. Format: 25/10/2026 atau 25-10-2026
    m2 = re.search(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b', text)
    if m2:
        part1 = int(m2.group(1))
        part2 = int(m2.group(2))
        year = int(m2.group(3))
        if year < 100:
            year += 2000
        # Di Indonesia umumnya DD/MM/YYYY
        day, month = part1, part2
        if month > 12 and day <= 12:
            day, month = month, day
        try:
            return f"{year:04d}-{month:02d}-{day:02d}"
        except:
            pass

    # 3. Format: 2026-10-25
    m3 = re.search(r'\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b', text)
    if m3:
        year = int(m3.group(1))
        month = int(m3.group(2))
        day = int(m3.group(3))
        try:
            return f"{year:04d}-{month:02d}-{day:02d}"
        except:
            pass

    return None

def extract_reference_number(lines, full_text):
    """Mencari nomor referensi unik atau ID transaksi eksternal."""
    patterns = [
        r'(?:no\.?\s*referensi|nomor\s*referensi|ref\s*id|ref\s*no|reference\s*no|ref\s*#|kode\s*referensi)[:\s]*([A-Za-z0-9_-]{6,36})',
        r'(?:id\s*transaksi|transaction\s*id|txid|no\s*resi|no\s*transaksi)[:\s]*([A-Za-z0-9_-]{6,36})',
        r'(?:no\.?\s*struk|receipt\s*no|order\s*id)[:\s]*([A-Za-z0-9_-]{5,30})',
    ]
    for p in patterns:
        m = re.search(p, full_text, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            if len(val) >= 5:
                return val

    # Cek baris per baris
    for i, line in enumerate(lines):
        if re.search(r'(?:referensi|transaction id|ref no|no ref)', line, re.IGNORECASE):
            # Cek nilai di baris yang sama atau baris berikutnya
            m = re.search(r'([A-Za-z0-9_-]{8,32})', line)
            if m:
                return m.group(1).strip()
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if re.match(r'^[A-Za-z0-9_-]{6,32}$', next_line):
                    return next_line
    return None

def extract_merchant_and_description(lines, full_text):
    """Mencari nama merchant, penerima, pengirim, atau toko."""
    merchant = ""
    description = ""

    # Pola penerima / merchant
    penerima_patterns = [
        r'(?:ke|penerima|tujuan|kepada|transfer\s*ke|bayar\s*ke)[:\s]*([^\n,]{3,40})',
        r'(?:merchant|toko|nama\s*merchant)[:\s]*([^\n,]{3,40})',
        r'(?:dari|pengirim|diterima\s*dari)[:\s]*([^\n,]{3,40})',
    ]
    for p in penerima_patterns:
        m = re.search(p, full_text, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            # Bersihkan dari kata noise
            if not re.search(r'^(rp|total|berhasil|sukses|mandiri|bca|bri|bni|tanggal)', candidate, re.IGNORECASE):
                merchant = candidate
                break

    # Jika belum ketemu, cek baris awal (biasanya nama toko ada di baris 1-3)
    if not merchant and len(lines) > 0:
        for line in lines[:4]:
            cleaned = line.strip()
            if len(cleaned) >= 4 and not re.search(r'(struk|bukti|transfer|berhasil|sukses|transaksi|rp|tanggal|jam)', cleaned, re.IGNORECASE):
                merchant = cleaned
                break

    # Buat deskripsi yang relevan
    if merchant:
        description = f"Transaksi {merchant}"
    elif len(lines) > 0:
        description = f"Bukti Transaksi ({lines[0][:30]})"
    else:
        description = "Transaksi Scan Bukti"

    return merchant, description

def parse_ocr_text(ocr_results):
    """
    ocr_results: list of [box, text, score] dari RapidOCR.
    """
    if not ocr_results:
        return {
            "success": True,
            "data": {
                "transaction_type": "expense",
                "amount": None,
                "currency": "IDR",
                "date": None,
                "description": "",
                "merchant": "",
                "reference_number": None,
                "suggested_account": None,
                "confidence": "low",
                "notes": "Tidak ada teks yang dapat dikenali pada gambar."
            }
        }

    lines = [item[1].strip() for item in ocr_results if item and len(item) > 1 and item[1].strip()]
    scores = [item[2] for item in ocr_results if item and len(item) > 2]
    avg_score = sum(scores) / len(scores) if scores else 0.5
    full_text = '\n'.join(lines)

    # 1. Transaction Type & Document Type
    tx_type = "expense"
    if re.search(r'(transfer\s*masuk|uang\s*masuk|terima\s*uang|kredit|penerimaan|top\s*up\s*berhasil)', full_text, re.IGNORECASE):
        tx_type = "income"

    is_invoice = bool(re.search(r'\b(?:invoice|faktur|tagihan|penagihan|sales\s*invoice|due\s*date|jatuh\s*tempo|jumlah\s*tagih|sisa\s*tagihan|uang\s*muka)\b', full_text, re.IGNORECASE))

    # 2. Amount (Nominal)
    amount = None
    subtotal = None
    amount_due = None
    amount_paid = None

    priority_patterns = [
        r'(?:grand\s*total|total\s*(?:bayar|akhir|faktur|transaksi|belanja|tagihan)|jumlah\s*tagih(?:an)?|jumlah\s*transfer|jumlah\s*pembayaran)[:\s]*rp\.?\s*([0-9.,]+)',
        r'(?:grand\s*total|total\s*akhir|total\s*faktur|jumlah\s*tagih)[:\s]*([0-9.,]+)',
        r'(?:total|nominal|jumlah)[:\s]*rp\.?\s*([0-9.,]+)',
        r'(?:total|nominal)[:\s]*([0-9.,]+)',
        r'rp\.?\s*([0-9.,]+)',
        r'idr\s*([0-9.,]+)',
    ]
    for p in priority_patterns:
        matches = re.finditer(p, full_text, re.IGNORECASE)
        for m in matches:
            cleaned = clean_amount(m.group(1))
            if cleaned and cleaned >= 100:  # Nominal wajar
                amount = cleaned
                break
        if amount:
            break

    # Multi-line lookahead untuk Subtotal, Total, Jumlah Tagih
    for i, line in enumerate(lines):
        line_clean = line.strip()
        if re.match(r'^(?:subtotal|sub\s*total|total\s*harga)[:\s]*$', line_clean, re.IGNORECASE) and subtotal is None:
            if i + 1 < len(lines):
                val = clean_amount(lines[i + 1])
                if val and val > 0:
                    subtotal = val
        if re.match(r'^(?:total|grand\s*total|total\s*faktur)[:\s]*$', line_clean, re.IGNORECASE) and amount is None:
            if i + 1 < len(lines):
                val = clean_amount(lines[i + 1])
                if val and val > 0:
                    amount = val
        if re.match(r'^(?:jumlah\s*tagih(?:an)?|sisa\s*tagihan|amount\s*due)[:\s]*$', line_clean, re.IGNORECASE) and amount_due is None:
            if i + 1 < len(lines):
                val = clean_amount(lines[i + 1])
                if val and val > 0:
                    amount_due = val
        if re.match(r'^(?:uang\s*muka|dp|down\s*payment|telah\s*dibayar)[:\s]*$', line_clean, re.IGNORECASE) and amount_paid is None:
            if i + 1 < len(lines):
                val = clean_amount(lines[i + 1])
                if val and val > 0:
                    amount_paid = val

    if not amount and amount_due:
        amount = amount_due
    elif not amount and subtotal:
        amount = subtotal

    # Fallback: scan angka terbesar yang masuk akal di baris (abaikan baris invoice id, nomor, tgl)
    if not amount:
        candidate_amounts = []
        for line in lines:
            if re.search(r'^(?:no\.?|invoice|faktur|ref|rekening|telp|id|tgl|tanggal)\b', line, re.IGNORECASE):
                continue
            m = re.search(r'([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?)', line)
            if m:
                c = clean_amount(m.group(1))
                if c and 500 <= c <= 1000000000:
                    candidate_amounts.append(c)
        if candidate_amounts:
            amount = max(candidate_amounts)

    # 3. Date
    date_val = extract_date(full_text)

    # 4. Reference Number
    ref_num = extract_reference_number(lines, full_text)

    # 5. Merchant & Description
    merchant, description = extract_merchant_and_description(lines, full_text)

    # 6. Suggested Account / Provider
    suggested_acc = None
    for prov_name, aliases in BANK_PROVIDERS:
        for alias in aliases:
            if re.search(rf'\b{alias}\b', full_text, re.IGNORECASE):
                suggested_acc = prov_name
                break
        if suggested_acc:
            break

    # 7. Confidence Score Calculation
    found_count = sum([
        1 if amount is not None else 0,
        1 if date_val is not None else 0,
        1 if ref_num is not None else 0,
        1 if merchant else 0,
        1 if suggested_acc else 0
    ])

    if found_count >= 3 and amount is not None and avg_score >= 0.7:
        confidence = "high"
    elif found_count >= 2 and amount is not None:
        confidence = "medium"
    else:
        confidence = "low"

    notes = []
    if not amount:
        notes.append("Nominal tidak terdeteksi otomatis, harap isi manual.")
    if not date_val:
        notes.append("Tanggal tidak terdeteksi.")
    if ref_num:
        notes.append(f"Ref: {ref_num}")

    return {
        "success": True,
        "data": {
            "document_type": "invoice" if is_invoice else "receipt",
            "transaction_type": tx_type,
            "amount": amount,
            "subtotal": subtotal,
            "amount_due": amount_due,
            "amount_paid": amount_paid,
            "currency": "IDR",
            "date": date_val,
            "description": description,
            "merchant": merchant,
            "reference_number": ref_num,
            "suggested_account": suggested_acc,
            "confidence": confidence,
            "notes": " ".join(notes)
        }
    }

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.webm', '.mkv', '.3gp', '.m4v'}

def process_video_frames(video_path, engine):
    """Mengekstrak frame dari rekaman video bukti transaksi dan mencari frame dengan teks terbaik."""
    try:
        import cv2
    except ImportError:
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames_to_test = []

    if total_frames > 5:
        # Sample frames at 15%, 35%, 55%, 75%, 90%
        percentages = [0.15, 0.35, 0.55, 0.75, 0.90]
        for p in percentages:
            target_idx = int(total_frames * p)
            cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx)
            ret, frame = cap.read()
            if ret and frame is not None:
                frames_to_test.append(frame)
    else:
        count = 0
        while count < 30:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            if count % 5 == 0:
                frames_to_test.append(frame)
            count += 1
    cap.release()

    if not frames_to_test:
        return None

    best_result = None
    best_score = -1

    for frame in frames_to_test:
        try:
            res, _ = engine(frame)
            if not res:
                continue
            parsed = parse_ocr_text(res)
            if parsed.get("success"):
                d = parsed.get("data", {})
                score = 0
                if d.get("amount") is not None:
                    score += 5
                if d.get("date"):
                    score += 3
                if d.get("merchant"):
                    score += 2
                if d.get("reference_number"):
                    score += 2
                if d.get("confidence") == "high":
                    score += 3
                elif d.get("confidence") == "medium":
                    score += 1

                if score > best_score:
                    best_score = score
                    best_result = parsed
                    if score >= 10:
                        break
        except Exception:
            continue

    if best_result:
        return best_result
    return parse_ocr_text(None)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Argumen path berkas tidak diberikan."}))
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "error": "Berkas bukti transaksi tidak ditemukan di sistem."}))
        sys.exit(1)

    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()

        _, ext = os.path.splitext(file_path.lower())
        output = None

        if ext in VIDEO_EXTENSIONS:
            output = process_video_frames(file_path, engine)
            if not output:
                # Fallback coba engine langsung jika ada format video yang didukung
                try:
                    result, _ = engine(file_path)
                    output = parse_ocr_text(result)
                except Exception:
                    pass

        if output is None:
            try:
                result, _ = engine(file_path)
                output = parse_ocr_text(result)
            except Exception as img_err:
                # Jika gagal sebagai gambar, coba sebagai video
                output = process_video_frames(file_path, engine)
                if not output:
                    raise img_err

        print(json.dumps(output, ensure_ascii=False))
    except ImportError as e:
        print(json.dumps({
            "success": False,
            "error": f"Modul OCR lokal belum terpasang: {str(e)}. Jalankan instalasi dependensi Python."
        }))
        sys.exit(1)
    except Exception as e:
        err_msg = str(e)
        if "cannot identify image file" in err_msg.lower() or "unsupported image" in err_msg.lower():
            err_msg = "Format berkas tidak dikenali sebagai gambar yang valid atau berkas rusak."
        else:
            err_msg = re.sub(r"[A-Za-z]:\\[^ \r\n\t\"\']+", "[berkas]", err_msg)
            err_msg = re.sub(r"data[\\/][^ \r\n\t\"\']+", "[berkas]", err_msg)
        print(json.dumps({"success": False, "error": f"Kesalahan OCR: {err_msg}"}))
        sys.exit(1)

if __name__ == '__main__':
    main()
