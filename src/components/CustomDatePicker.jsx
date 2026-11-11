'use client';

import React, { useState, useRef, useEffect, useCallback, useId, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X, Check, RotateCcw } from 'lucide-react';
import {
  INDONESIAN_MONTHS,
  INDONESIAN_DAYS,
  getTodayWIB,
  parseDateString,
  formatDateString,
  formatDisplayDate,
} from '@/lib/date-utils';

export {
  INDONESIAN_MONTHS,
  INDONESIAN_DAYS,
  getTodayWIB,
  parseDateString,
  formatDateString,
  formatDisplayDate,
};

/**
 * @typedef {Object} CustomDatePickerProps
 * @property {string} value - Tanggal terpilih (YYYY-MM-DD)
 * @property {(value: string) => void} onChange - Callback saat tanggal dikonfirmasi
 * @property {string} [placeholder='Pilih tanggal...']
 * @property {boolean} [disabled=false]
 * @property {string} [className='']
 * @property {string} [buttonClassName='']
 * @property {string} [id]
 * @property {'sm' | 'md'} [size='sm']
 * @property {string} [minDate] - Batas minimum YYYY-MM-DD
 * @property {string} [maxDate] - Batas maksimum YYYY-MM-DD
 */

/**
 * Komponen Date Picker FigCraft Kayla Finance
 * Responsif pada Android 360px-430px, Tablet, dan Desktop.
 * Bebas pergeseran zona waktu UTC (Asia/Jakarta native).
 * Tertutup secara default dan hanya terbuka via aksi klik eksplisit.
 */
export default function CustomDatePicker({
  value,
  onChange,
  placeholder = 'Pilih tanggal...',
  disabled = false,
  className = '',
  buttonClassName = '',
  id,
  size = 'sm',
  minDate,
  maxDate,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  // Nilai draf saat kalender terbuka sebelum tombol Konfirmasi / Pilih ditekan
  const [draftDate, setDraftDate] = useState(() => value || getTodayWIB());

  // Bulan dan tahun yang sedang dilihat di kalender
  const parsedInitial = parseDateString(value) || parseDateString(getTodayWIB());
  const [viewYear, setViewYear] = useState(parsedInitial ? parsedInitial.year : 2026);
  const [viewMonth, setViewMonth] = useState(parsedInitial ? parsedInitial.month : 10);

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const generatedId = useId();
  const datePickerId = id || generatedId;

  // Tanggal hari ini di WIB untuk penanda kalender
  const todayWIB = useMemo(() => getTodayWIB(), []);

  // Update draf & tampilan saat value eksternal berubah
  useEffect(() => {
    if (value) {
      setDraftDate(value);
      const parsed = parseDateString(value);
      if (parsed) {
        setViewYear(parsed.year);
        setViewMonth(parsed.month);
      }
    }
  }, [value]);

  // Deteksi arah dropdown (atas/bawah) & batas horizontal layar agar tidak terpotong
  const determinePosition = useCallback(() => {
    if (containerRef.current && typeof window !== 'undefined') {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Kalender membutuhkan tinggi sekitar 320px
      setOpenUpwards(spaceBelow < 320 && spaceAbove > spaceBelow);

      // Batas kanan layar (lebar kalender sekitar 300px)
      const spaceRight = window.innerWidth - rect.left;
      setAlignRight(spaceRight < 310 && rect.right > 290);
    }
  }, []);

  // Toggle buka/tutup kalender
  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (!isOpen) {
      determinePosition();
      // Sinkronkan draf dengan value saat ini
      const currentVal = value || getTodayWIB();
      setDraftDate(currentVal);
      const parsed = parseDateString(currentVal);
      if (parsed) {
        setViewYear(parsed.year);
        setViewMonth(parsed.month);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [disabled, isOpen, determinePosition, value]);

  // Tutup saat klik di luar popover
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Penanganan tombol keyboard: Escape menutup, Tab terjaga
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleToggle();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Navigasi bulan sebelumnya
  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  // Navigasi bulan berikutnya
  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  // Pilih hari
  const handleSelectDay = (day) => {
    const formatted = formatDateString(viewYear, viewMonth, day);
    setDraftDate(formatted);
  };

  // Konfirmasi tanggal terpilih
  const handleConfirm = (e) => {
    e?.stopPropagation();
    if (draftDate) {
      onChange(draftDate);
    }
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Batal dan pulihkan tanggal sebelumnya
  const handleCancel = (e) => {
    e?.stopPropagation();
    setDraftDate(value || getTodayWIB());
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Tombol pintasan "Hari Ini"
  const handleSelectToday = (e) => {
    e.stopPropagation();
    const today = getTodayWIB();
    setDraftDate(today);
    const parsed = parseDateString(today);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  };

  // Perhitungan kalender bulanan
  const daysInMonth = useMemo(() => {
    return new Date(viewYear, viewMonth + 1, 0).getDate();
  }, [viewYear, viewMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).getDay();
  }, [viewYear, viewMonth]);

  // Daftar opsi tahun (dari 2020 hingga 2030)
  const yearOptions = useMemo(() => {
    const years = [];
    const currentYear = parsedInitial ? parsedInitial.year : 2026;
    const startYear = Math.min(2020, currentYear - 5);
    const endYear = Math.max(2030, currentYear + 5);
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    return years;
  }, [parsedInitial]);

  // Ukuran padding input
  const isSm = size === 'sm';
  const sizeClasses = isSm
    ? 'px-2.5 py-1.5 text-xs rounded-lg'
    : 'px-3.5 py-2.5 text-xs sm:text-sm rounded-xl';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left select-none ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Tombol Pemicu Tanggal FigCraft */}
      <button
        type="button"
        ref={triggerRef}
        id={datePickerId}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Pilih Tanggal Transaksi"
        className={`w-full bg-white border flex items-center justify-between gap-2 transition-all duration-150 font-medium touch-manipulation ${sizeClasses} ${
          isOpen
            ? 'border-emerald-600 ring-2 ring-emerald-500/15 shadow-xs'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : 'cursor-pointer active:scale-[0.99]'} ${buttonClassName}`}
      >
        <span className="flex items-center gap-2 truncate text-slate-800">
          <Calendar
            className={`shrink-0 transition-colors duration-150 ${
              isSm ? 'w-3.5 h-3.5' : 'w-4 h-4'
            } ${isOpen ? 'text-emerald-600' : 'text-slate-400'}`}
          />
          <span className="truncate">
            {value ? formatDisplayDate(value) : placeholder}
          </span>
        </span>
      </button>

      {/* Popover Kalender FigCraft (Z-[80] agar di atas modal) */}
      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label="Pilih Tanggal"
          className={`absolute z-[80] bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-3.5 w-[300px] max-w-[calc(100vw-1.5rem)] touch-manipulation ${
            alignRight ? 'right-0 left-auto' : 'left-0'
          } ${
            openUpwards
              ? 'bottom-full mb-1.5 animate-dropdown-up origin-bottom'
              : 'top-full mt-1.5 animate-dropdown-down origin-top'
          }`}
        >
          {/* Header Kalender: Navigasi Bulan & Tahun */}
          <div className="flex items-center justify-between gap-1 pb-3 mb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Bulan sebelumnya"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {/* Dropdown Bulan */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold py-1 px-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-600 cursor-pointer"
              >
                {INDONESIAN_MONTHS.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Dropdown Tahun */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold py-1 px-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-600 cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Bulan berikutnya"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Baris Nama Hari */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {INDONESIAN_DAYS.map((dayName, idx) => (
              <span
                key={dayName}
                className={`text-[10px] font-bold tracking-wider py-1 ${
                  idx === 0 ? 'text-rose-500' : 'text-slate-400'
                }`}
              >
                {dayName}
              </span>
            ))}
          </div>

          {/* Grid Tanggal */}
          <div className="grid grid-cols-7 gap-1">
            {/* Slot kosong sebelum hari pertama */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="w-8 h-8" />
            ))}

            {/* Tombol setiap hari dalam bulan */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = formatDateString(viewYear, viewMonth, day);
              const isSelected = draftDate === dateStr;
              const isToday = todayWIB === dateStr;

              // Cek batasan minDate / maxDate
              const isBeforeMin = minDate ? dateStr < minDate : false;
              const isAfterMax = maxDate ? dateStr > maxDate : false;
              const isDisabled = isBeforeMin || isAfterMax;

              let cellStyle = 'text-slate-700 hover:bg-slate-100 font-medium';
              if (isSelected) {
                cellStyle = 'bg-emerald-600 text-white font-bold shadow-xs hover:bg-emerald-700';
              } else if (isToday) {
                cellStyle = 'border border-emerald-400 font-bold text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100/70';
              }

              if (isDisabled) {
                cellStyle = 'text-slate-300 cursor-not-allowed opacity-40';
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(day)}
                  className={`w-8 h-8 mx-auto flex items-center justify-center text-xs rounded-lg transition-all active:scale-95 cursor-pointer ${cellStyle}`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Bagian Bawah: Aksi Batal, Hari Ini, dan Pilih */}
          <div className="flex items-center justify-between gap-1.5 pt-3 mt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline px-1 py-1 rounded transition-colors cursor-pointer"
            >
              Hari Ini
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCancel}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Pilih</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
