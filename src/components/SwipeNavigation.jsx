'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MAIN_TABS = ['/', '/accounts', '/transactions', '/trading', '/reports'];
const TAB_NAMES = {
  '/': 'Dashboard',
  '/accounts': 'Akun',
  '/transactions': 'Transaksi',
  '/trading': 'MT5 Trading',
  '/reports': 'Laporan',
};

/**
 * @typedef {Object} SwipeNavigationProps
 * @property {React.ReactNode} children
 */

/**
 * Komponen navigasi swipe tab horizontal tingkat root dengan akselerasi GPU 1:1.
 * @param {SwipeNavigationProps} props
 * @returns {React.ReactElement}
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const prevPathRef = useRef(pathname);
  const [slideDirection, setSlideDirection] = useState('none');

  // DOM Refs untuk manipulasi GPU translate3d langsung tanpa render React pada touchmove
  const contentRef = useRef(null);
  const pillRef = useRef(null);

  // Status sentuhan
  const touchStateRef = useRef({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    isVerticalScroll: false,
    isHorizontalSwipe: false,
    valid: false,
    currentOffset: 0,
  });

  const isNavigatingRef = useRef(false);

  // Periksa preferensi reduced motion
  const prefersReducedMotion = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Reset posisi dan transisi saat rute berubah
  useEffect(() => {
    const prev = prevPathRef.current;
    const current = pathname;

    const prevIndex = MAIN_TABS.indexOf(prev);
    const currentIndex = MAIN_TABS.indexOf(current);

    if (prevIndex !== -1 && currentIndex !== -1 && prevIndex !== currentIndex) {
      if (currentIndex > prevIndex) {
        setSlideDirection('right');
      } else {
        setSlideDirection('left');
      }
    } else {
      setSlideDirection('none');
    }

    prevPathRef.current = current;
    isNavigatingRef.current = false;

    // Bersihkan transform inline agar kelas CSS slide-in bekerja normal
    if (contentRef.current) {
      contentRef.current.style.transform = '';
      contentRef.current.style.transition = '';
      contentRef.current.style.opacity = '';
    }
    if (pillRef.current) {
      pillRef.current.style.display = 'none';
    }
  }, [pathname]);

  // Touch Start
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1 || isNavigatingRef.current) return;

    const touch = e.touches[0];
    const target = /** @type {HTMLElement | null} */ (e.target);

    // Prioritas 2: Abaikan jika di dalam kontrol interaktif, modal, chart, tabel scroll, atau input
    if (target) {
      const isInteractive = target.closest(
        'input, textarea, select, button, [role="dialog"], [role="slider"], [role="listbox"], [role="option"], .recharts-wrapper, svg, .overflow-x-auto, table, [data-swipe-ignore="true"]'
      );
      if (isInteractive) {
        touchStateRef.current.valid = false;
        return;
      }
    }

    // Prioritas 4: Proteksi gestur tepi Android (hindari bentrok dengan navigasi Back sistem di tepi layar < 24px atau > width - 24px)
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    if (touch.clientX < 24 || touch.clientX > windowWidth - 24) {
      touchStateRef.current.valid = false;
      return;
    }

    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startTime: Date.now(),
      isVerticalScroll: false,
      isHorizontalSwipe: false,
      valid: true,
      currentOffset: 0,
    };
  }, []);

  // Touch Move (60fps/120fps langsung pada GPU tanpa re-render React)
  const handleTouchMove = useCallback((e) => {
    const state = touchStateRef.current;
    if (!state.valid || isNavigatingRef.current) return;

    const touch = e.touches[0];
    state.currentX = touch.clientX;
    state.currentY = touch.clientY;

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Prioritas 1: Kunci scroll vertikal langsung jika gerakan vertikal lebih dominan
    if (!state.isHorizontalSwipe && !state.isVerticalScroll) {
      if (absY > 6 && absY >= absX) {
        state.isVerticalScroll = true;
        return;
      }
      // Prioritas 3: Swipe horizontal aktif hanya jika horizontal jelas dominan
      if (absX > 10 && absX > absY * 1.35) {
        state.isHorizontalSwipe = true;
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
        }
      }
    }

    if (state.isVerticalScroll) {
      return;
    }

    if (state.isHorizontalSwipe) {
      if (prefersReducedMotion()) return;

      const currentIndex = MAIN_TABS.indexOf(pathname);
      const isAtStart = currentIndex === 0 && deltaX > 0;
      const isAtEnd = currentIndex === MAIN_TABS.length - 1 && deltaX < 0;

      // Gerakan 1:1 mengikuti jari secara langsung.
      // Hanya terapkan resistensi elastis (rubber-band) saat di batas tab pertama/terakhir.
      let effectiveOffset = deltaX;
      if (isAtStart || isAtEnd) {
        effectiveOffset = Math.sign(deltaX) * Math.pow(Math.abs(deltaX), 0.72) * 2;
      }

      state.currentOffset = effectiveOffset;

      // Transformasi GPU langsung tanpa me-render ulang React
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${effectiveOffset}px, 0, 0)`;
      }

      // Tampilkan indikator tujuan tab melayang secara langsung di DOM
      if (pillRef.current) {
        if (deltaX < -28 && currentIndex < MAIN_TABS.length - 1) {
          pillRef.current.textContent = `${TAB_NAMES[MAIN_TABS[currentIndex + 1]] || ''} →`;
          pillRef.current.style.display = 'block';
        } else if (deltaX > 28 && currentIndex > 0) {
          pillRef.current.textContent = `← ${TAB_NAMES[MAIN_TABS[currentIndex - 1]] || ''}`;
          pillRef.current.style.display = 'block';
        } else {
          pillRef.current.style.display = 'none';
        }
      }
    }
  }, [pathname, prefersReducedMotion]);

  // Touch End (Transisi halus dengan spring easing yang responsif)
  const handleTouchEnd = useCallback(() => {
    const state = touchStateRef.current;
    if (!state.valid || isNavigatingRef.current || state.isVerticalScroll) {
      state.valid = false;
      if (pillRef.current) pillRef.current.style.display = 'none';
      if (contentRef.current && state.currentOffset !== 0) {
        contentRef.current.style.transition = 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        contentRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      return;
    }

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const elapsed = Date.now() - state.startTime;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const velocity = absX / Math.max(1, elapsed); // px per ms

    state.valid = false;
    if (pillRef.current) pillRef.current.style.display = 'none';

    // Ambang swipe responsif:
    // 1. Geser lambat: jarak minimal 50px
    // 2. Geser cepat (flick): velocity > 0.28 px/ms dengan jarak minimal 28px
    const isValidSwipe =
      (absX > 50 || (velocity > 0.28 && absX > 28)) &&
      absX > absY * 1.3 &&
      elapsed < 600;

    const currentIndex = MAIN_TABS.indexOf(pathname);

    if (isValidSwipe && currentIndex !== -1) {
      if (deltaX < 0 && currentIndex < MAIN_TABS.length - 1) {
        // Swipe ke kiri -> Lanjut ke tab berikutnya di kanan
        isNavigatingRef.current = true;
        const nextRoute = MAIN_TABS[currentIndex + 1];

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }

        if (contentRef.current && !prefersReducedMotion()) {
          contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 200ms ease-out';
          contentRef.current.style.transform = 'translate3d(-100%, 0, 0)';
          contentRef.current.style.opacity = '0.65';
        }

        router.push(nextRoute);
        return;
      } else if (deltaX > 0 && currentIndex > 0) {
        // Swipe ke kanan -> Kembali ke tab sebelumnya di kiri
        isNavigatingRef.current = true;
        const prevRoute = MAIN_TABS[currentIndex - 1];

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }

        if (contentRef.current && !prefersReducedMotion()) {
          contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 200ms ease-out';
          contentRef.current.style.transform = 'translate3d(100%, 0, 0)';
          contentRef.current.style.opacity = '0.65';
        }

        router.push(prevRoute);
        return;
      }
    }

    // Jika tidak memenuhi ambang, kembalikan ke posisi semula dengan easing natural
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, [pathname, router, prefersReducedMotion]);

  const handleTouchCancel = useCallback(() => {
    touchStateRef.current.valid = false;
    isNavigatingRef.current = false;
    if (pillRef.current) pillRef.current.style.display = 'none';
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="flex-1 flex flex-col min-w-0 relative"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Indikator nama tab tujuan melayang pada perangkat Android */}
      <div
        ref={pillRef}
        style={{ display: 'none' }}
        className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/85 text-white text-[11px] font-semibold px-3 py-1 rounded-full shadow-md backdrop-blur-xs pointer-events-none tracking-wide"
      />

      <div
        ref={contentRef}
        key={pathname}
        className={`flex-1 flex flex-col min-w-0 will-change-transform ${
          slideDirection === 'right'
            ? 'animate-slide-in-right'
            : slideDirection === 'left'
            ? 'animate-slide-in-left'
            : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}
