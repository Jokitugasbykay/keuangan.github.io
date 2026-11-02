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

const TOUCH_SLOP = 18; // Jarak minimal dalam pixel sebelum gesture diklasifikasikan
const EDGE_ZONE = 28;  // Proteksi gesture tepi sistem Android (Back gesture)

/**
 * @typedef {Object} SwipeNavigationProps
 * @property {React.ReactNode} children
 */

/**
 * Komponen navigasi swipe tab horizontal tingkat root dengan urutan alami:
 * Swipe Kanan: Dashboard -> Akun -> Transaksi -> MT5 -> Laporan.
 * Swipe Kiri: Laporan -> MT5 -> Transaksi -> Akun -> Dashboard.
 * Dilengkapi proteksi layout shift, isolasi scroll vertikal, dan akselerasi GPU.
 * @param {SwipeNavigationProps} props
 * @returns {React.ReactElement}
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const prevPathRef = useRef(pathname);
  const [slideDirection, setSlideDirection] = useState('none');
  const navigationTriggerRef = useRef('none');
  const navTimeoutRef = useRef(null);

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
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }

    const prev = prevPathRef.current;
    const current = pathname;

    const prevIndex = MAIN_TABS.indexOf(prev);
    const currentIndex = MAIN_TABS.indexOf(current);
    const trigger = navigationTriggerRef.current;
    navigationTriggerRef.current = 'none';

    if (prevIndex !== -1 && currentIndex !== -1 && prevIndex !== currentIndex) {
      if (trigger === 'swipe-right') {
        // Konten baru meluncur masuk dari sisi kiri
        setSlideDirection('left');
      } else if (trigger === 'swipe-left') {
        // Konten baru meluncur masuk dari sisi kanan
        setSlideDirection('right');
      } else {
        // Navigasi melalui klik tombol bottom nav atau tautan
        if (currentIndex > prevIndex) {
          setSlideDirection('right');
        } else {
          setSlideDirection('left');
        }
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

    // Abaikan jika di dalam kontrol interaktif, tautan, modal, chart, tabel scroll, atau elemen yang diabaikan
    if (target) {
      const isInteractive = target.closest(
        'input, textarea, select, button, a, [role="dialog"], [role="slider"], [role="listbox"], [role="option"], .recharts-wrapper, svg, .overflow-x-auto, table, [data-swipe-ignore="true"]'
      );
      if (isInteractive) {
        touchStateRef.current.valid = false;
        return;
      }
    }

    // Proteksi gestur tepi Android (hindari bentrok dengan navigasi Back sistem di tepi layar)
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    if (touch.clientX < EDGE_ZONE || touch.clientX > windowWidth - EDGE_ZONE) {
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

  // Touch Move dengan pemisahan sumbu yang ketat dan redaman pegas (spring damping)
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

    // Tahap 1: Pengenalan Arah Berbasis Touch Slop
    if (!state.isHorizontalSwipe && !state.isVerticalScroll) {
      const totalMovement = Math.hypot(deltaX, deltaY);
      if (totalMovement < TOUCH_SLOP) {
        // Jangan geser halaman sama sekali jika gerakan belum melampaui touch slop
        return;
      }

      // Kunci ke scroll vertikal jika ada komponen vertikal yang signifikan
      if (absY >= absX * 0.65) {
        state.isVerticalScroll = true;
        return;
      }

      // Swipe horizontal hanya dikunci jika arah jelas horizontal (sudut < 24 derajat)
      if (absX >= TOUCH_SLOP && absX > absY * 2.2) {
        state.isHorizontalSwipe = true;
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
        }
      } else {
        // Gerakan diagonal ambigu: abaikan dan prioritaskan kestabilan scroll
        state.isVerticalScroll = true;
        return;
      }
    }

    // Jika telah terkunci sebagai scroll vertikal, jangan pernah menggeser layout horizontal
    if (state.isVerticalScroll) {
      return;
    }

    // Tahap 2: Pemrosesan Swipe Horizontal yang Valid
    if (state.isHorizontalSwipe) {
      if (prefersReducedMotion()) return;

      // Jika di tengah swipe gerakan berubah tajam ke arah vertikal, batalkan geseran
      if (absY > absX * 1.5) {
        state.valid = false;
        if (contentRef.current) {
          contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
          contentRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
        if (pillRef.current) pillRef.current.style.display = 'none';
        return;
      }

      const currentIndex = MAIN_TABS.indexOf(pathname);

      // Urutan Navigasi Alami:
      // Swipe Kanan (deltaX > 0): Maju ke halaman berikutnya (Dashboard -> Akun -> Transaksi -> MT5 -> Laporan)
      // Swipe Kiri (deltaX < 0): Mundur ke halaman sebelumnya (Laporan -> MT5 -> Transaksi -> Akun -> Dashboard)
      const isSwipingRight = deltaX > 0;
      const isSwipingLeft = deltaX < 0;
      const hasNextTab = currentIndex !== -1 && currentIndex < MAIN_TABS.length - 1;
      const hasPrevTab = currentIndex !== -1 && currentIndex > 0;
      const isValidDirection = (isSwipingRight && hasNextTab) || (isSwipingLeft && hasPrevTab);

      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

      // Redaman progresif (Spring Resistance):
      // Batasi pergeseran maksimal agar kartu dan judul halaman tidak terlempar keluar layar
      let effectiveOffset = 0;
      if (isValidDirection) {
        const maxAllowedShift = Math.min(windowWidth * 0.22, 85);
        effectiveOffset = Math.sign(deltaX) * Math.min(maxAllowedShift, Math.pow(absX, 0.8) * 1.35);
      } else {
        // Batas elastis minimal (max 15px) jika sudah di batas awal atau akhir
        effectiveOffset = Math.sign(deltaX) * Math.min(15, Math.pow(absX, 0.5) * 1.5);
      }

      state.currentOffset = effectiveOffset;

      // Terapkan translasi halus pada GPU
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${effectiveOffset}px, 0, 0)`;
      }

      // Tampilkan indikator nama tab tujuan
      if (pillRef.current) {
        if (deltaX > 28 && hasNextTab) {
          pillRef.current.textContent = `${TAB_NAMES[MAIN_TABS[currentIndex + 1]] || ''} →`;
          pillRef.current.style.display = 'block';
        } else if (deltaX < -28 && hasPrevTab) {
          pillRef.current.textContent = `← ${TAB_NAMES[MAIN_TABS[currentIndex - 1]] || ''}`;
          pillRef.current.style.display = 'block';
        } else {
          pillRef.current.style.display = 'none';
        }
      }
    }
  }, [pathname, prefersReducedMotion]);

  // Touch End
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

    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

    // Ambang batas swipe yang presisi:
    // 1. Geser lambat: minimal 18% lebar layar atau minimal 70px
    // 2. Geser cepat (flick): velocity > 0.28 px/ms dengan jarak minimal 32px dan waktu < 350ms
    const isValidSwipe =
      (absX >= Math.max(70, windowWidth * 0.18) || (velocity > 0.28 && absX >= 32 && elapsed < 350)) &&
      absX > absY * 2.0 &&
      elapsed < 700;

    const currentIndex = MAIN_TABS.indexOf(pathname);

    if (isValidSwipe && currentIndex !== -1) {
      if (deltaX > 0 && currentIndex < MAIN_TABS.length - 1) {
        // Swipe Kanan -> Maju ke tab berikutnya sesuai urutan:
        // Dashboard -> Akun -> Transaksi -> MT5 -> Laporan
        isNavigatingRef.current = true;
        navigationTriggerRef.current = 'swipe-right';
        const nextRoute = MAIN_TABS[currentIndex + 1];

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }

        if (contentRef.current && !prefersReducedMotion()) {
          contentRef.current.style.transition = 'transform 190ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 190ms ease-out';
          contentRef.current.style.transform = 'translate3d(100%, 0, 0)';
          contentRef.current.style.opacity = '0.65';
        }

        // Batas waktu pengaman jika navigasi terhambat
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 500);

        router.push(nextRoute);
        return;
      } else if (deltaX < 0 && currentIndex > 0) {
        // Swipe Kiri -> Mundur ke tab sebelumnya:
        // Laporan -> MT5 -> Transaksi -> Akun -> Dashboard
        isNavigatingRef.current = true;
        navigationTriggerRef.current = 'swipe-left';
        const prevRoute = MAIN_TABS[currentIndex - 1];

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }

        if (contentRef.current && !prefersReducedMotion()) {
          contentRef.current.style.transition = 'transform 190ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 190ms ease-out';
          contentRef.current.style.transform = 'translate3d(-100%, 0, 0)';
          contentRef.current.style.opacity = '0.65';
        }

        // Batas waktu pengaman jika navigasi terhambat
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 500);

        router.push(prevRoute);
        return;
      }
    }

    // Jika tidak memenuhi ambang batas perpindahan, kembalikan posisi dengan spring easing halus
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

  const handleAnimationEnd = useCallback(() => {
    setSlideDirection('none');
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="flex-1 flex flex-col min-w-0 w-full relative overflow-x-hidden"
      style={{ touchAction: 'pan-y pinch-zoom' }}
    >
      {/* Indikator nama tab tujuan melayang */}
      <div
        ref={pillRef}
        style={{ display: 'none' }}
        className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-900/85 text-white text-[11px] font-semibold px-3 py-1 rounded-full shadow-md backdrop-blur-xs pointer-events-none tracking-wide"
      />

      <div
        ref={contentRef}
        key={pathname}
        onAnimationEnd={handleAnimationEnd}
        className={`flex-1 flex flex-col min-w-0 w-full will-change-transform ${
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
