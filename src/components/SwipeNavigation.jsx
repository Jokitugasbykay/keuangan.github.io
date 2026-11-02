'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MAIN_TABS, TAB_NAMES, normalizePath } from '@/lib/navigation';

const TOUCH_SLOP = 14;   // Jarak minimal pixel sebelum gesture diklasifikasikan
const EDGE_ZONE = 22;    // Proteksi gesture tepi Android dan iOS

/**
 * @typedef {Object} SwipeNavigationProps
 * @property {React.ReactNode} children
 */

/**
 * Transition Controller navigasi swipe dua halaman dalam satu viewport tetap.
 * Urutan alami navigasi:
 * Swipe Kanan (deltaX > 0): Dashboard -> Akun -> Transaksi -> MT5 -> Laporan.
 * Swipe Kiri (deltaX < 0): Laporan -> MT5 -> Transaksi -> Akun -> Dashboard.
 * 
 * Kedua halaman bergerak secara sinkron dan kontinu:
 * - Halaman lama bergerak keluar mengikuti arah gesture.
 * - Halaman tujuan bergerak masuk dari arah berlawanan.
 * - Setelah transisi selesai, halaman baru berada tepat di posisi normal tanpa layout shift.
 * 
 * @param {SwipeNavigationProps} props
 * @returns {React.ReactElement}
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const normalizedCurrent = normalizePath(pathname);

  // Stack halaman untuk Transition Controller dua halaman
  const [pageStack, setPageStack] = useState(() => ({
    currentKey: normalizedCurrent,
    currentNode: children,
    leavingKey: null,
    leavingNode: null,
    direction: 'none', // 'slide-left' | 'slide-right' | 'none'
    isTransitioning: false,
  }));

  const navigationTriggerRef = useRef('none');
  const navTimeoutRef = useRef(null);

  // Sinkronisasi perpindahan halaman secara langsung saat pathname berubah
  if (normalizedCurrent !== pageStack.currentKey) {
    const prevIndex = MAIN_TABS.indexOf(pageStack.currentKey);
    const currIndex = MAIN_TABS.indexOf(normalizedCurrent);
    const trigger = navigationTriggerRef.current;
    navigationTriggerRef.current = 'none';

    let direction = 'slide-left';
    if (trigger === 'swipe-right') {
      // Geser jari ke kanan: halaman lama bergerak ke kanan, halaman baru masuk dari kiri
      direction = 'slide-right';
    } else if (trigger === 'swipe-left') {
      // Geser jari ke kiri: halaman lama bergerak ke kiri, halaman baru masuk dari kanan
      direction = 'slide-left';
    } else {
      // Klik Bottom Navigation atau link:
      // Index lebih tinggi: bergerak ke kiri (masuk dari kanan)
      // Index lebih rendah: bergerak ke kanan (masuk dari kiri)
      direction = currIndex > prevIndex ? 'slide-left' : 'slide-right';
    }

    setPageStack({
      currentKey: normalizedCurrent,
      currentNode: children,
      leavingKey: pageStack.currentKey,
      leavingNode: pageStack.currentNode,
      direction,
      isTransitioning: true,
    });
  }

  // Update currentNode jika children berubah pada rute yang sama (misal re-render data)
  useEffect(() => {
    if (pageStack.currentKey === normalizedCurrent && pageStack.currentNode !== children) {
      setPageStack((prev) => ({ ...prev, currentNode: children }));
    }
  }, [children, normalizedCurrent, pageStack.currentKey, pageStack.currentNode]);

  // Akhiri transisi saat animasi selesai
  const handleTransitionEnd = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
    setPageStack((prev) => ({
      ...prev,
      isTransitioning: false,
      leavingNode: null,
      leavingKey: null,
      direction: 'none',
    }));
  }, []);

  // Batas waktu pengaman jika event onAnimationEnd terhalang di browser
  useEffect(() => {
    if (pageStack.isTransitioning) {
      const timer = setTimeout(() => {
        setPageStack((prev) => ({
          ...prev,
          isTransitioning: false,
          leavingNode: null,
          leavingKey: null,
          direction: 'none',
        }));
      }, 270);
      return () => clearTimeout(timer);
    }
  }, [pageStack.isTransitioning]);

  // DOM Refs untuk manipulasi GPU translate3d selama sentuhan aktif
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
    ignoreLeftSwipe: false,
  });

  const isNavigatingRef = useRef(false);

  // Periksa preferensi reduced motion
  const prefersReducedMotion = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Pembersihan DOM saat rute berubah
  useEffect(() => {
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }

    isNavigatingRef.current = false;

    if (contentRef.current) {
      contentRef.current.style.transform = '';
      contentRef.current.style.transition = '';
    }
    if (pillRef.current) {
      pillRef.current.style.display = 'none';
    }
  }, [normalizedCurrent]);

  // Touch Start
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1 || isNavigatingRef.current || pageStack.isTransitioning) return;

    const touch = e.touches[0];
    const target = /** @type {HTMLElement | null} */ (e.target);

    let ignoreLeftSwipe = false;

    if (target) {
      // Kontrol interaktif, input, select, button, dialog, chart, dan tabel scroll
      const isHardInteractive = target.closest(
        'input, textarea, select, button, a, [role="button"], [role="dialog"], [role="slider"], [role="listbox"], [role="option"], [role="tab"], .recharts-wrapper, svg, .overflow-x-auto, table'
      );
      if (isHardInteractive) {
        touchStateRef.current.valid = false;
        return;
      }

      // Kartu swipe-to-reveal transaksi: abaikan swipe kiri agar tombol aksi terbuka
      if (target.closest('[data-swipe-ignore="true"]')) {
        ignoreLeftSwipe = true;
      }
    }

    // Proteksi gestur tepi Android dan iOS
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
      ignoreLeftSwipe,
    };
  }, [pageStack.isTransitioning]);

  // Touch Move
  const handleTouchMove = useCallback((e) => {
    const state = touchStateRef.current;
    if (!state.valid || isNavigatingRef.current || pageStack.isTransitioning) return;

    const touch = e.touches[0];
    state.currentX = touch.clientX;
    state.currentY = touch.clientY;

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Tahap 1: Klasifikasi Arah Berbasis Touch Slop
    if (!state.isHorizontalSwipe && !state.isVerticalScroll) {
      const totalMovement = Math.hypot(deltaX, deltaY);
      if (totalMovement < TOUCH_SLOP) {
        return;
      }

      // Kunci ke scroll vertikal jika ada komponen vertikal dominan
      if (absY > absX * 0.7) {
        state.isVerticalScroll = true;
        return;
      }

      // Kunci ke swipe horizontal jika arah jelas horizontal (sudut < 26 derajat)
      if (absX >= TOUCH_SLOP && absX > absY * 2.0) {
        state.isHorizontalSwipe = true;
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
        }
      } else {
        state.isVerticalScroll = true;
        return;
      }
    }

    if (state.isVerticalScroll) {
      return;
    }

    // Tahap 2: Pemrosesan Swipe Horizontal
    if (state.isHorizontalSwipe) {
      if (state.ignoreLeftSwipe && deltaX < 0) {
        return;
      }

      if (prefersReducedMotion()) return;

      // Jika di tengah swipe gerakan berbelok tajam ke vertikal, batalkan
      if (absY > absX * 1.6) {
        state.valid = false;
        if (contentRef.current) {
          contentRef.current.style.transition = 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1)';
          contentRef.current.style.transform = 'translate3d(0, 0, 0)';
        }
        if (pillRef.current) pillRef.current.style.display = 'none';
        return;
      }

      const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);
      const isSwipingRight = deltaX > 0;
      const isSwipingLeft = deltaX < 0;
      const hasNextTab = currentIndex !== -1 && currentIndex < MAIN_TABS.length - 1;
      const hasPrevTab = currentIndex !== -1 && currentIndex > 0;
      const isValidDirection = (isSwipingRight && hasNextTab) || (isSwipingLeft && hasPrevTab);

      // Redaman halus interaktif maksimal 36px agar konten tidak terlempar keluar layar sebelum navigasi
      let effectiveOffset = 0;
      if (isValidDirection) {
        effectiveOffset = Math.sign(deltaX) * Math.min(36, Math.pow(absX, 0.72) * 1.1);
      } else {
        effectiveOffset = Math.sign(deltaX) * Math.min(10, Math.pow(absX, 0.5) * 1.0);
      }

      state.currentOffset = effectiveOffset;

      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${effectiveOffset}px, 0, 0)`;
      }

      // Tampilkan indikator nama tab tujuan di atas bottom navigation bar
      if (pillRef.current) {
        if (deltaX > 25 && hasNextTab) {
          pillRef.current.textContent = `${TAB_NAMES[MAIN_TABS[currentIndex + 1]] || ''} →`;
          pillRef.current.style.display = 'block';
        } else if (deltaX < -25 && hasPrevTab) {
          pillRef.current.textContent = `← ${TAB_NAMES[MAIN_TABS[currentIndex - 1]] || ''}`;
          pillRef.current.style.display = 'block';
        } else {
          pillRef.current.style.display = 'none';
        }
      }
    }
  }, [normalizedCurrent, pageStack.isTransitioning, prefersReducedMotion]);

  // Touch End
  const handleTouchEnd = useCallback(() => {
    const state = touchStateRef.current;
    if (!state.valid || isNavigatingRef.current || state.isVerticalScroll || pageStack.isTransitioning) {
      state.valid = false;
      if (pillRef.current) pillRef.current.style.display = 'none';
      if (contentRef.current && state.currentOffset !== 0) {
        contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        contentRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      return;
    }

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const elapsed = Date.now() - state.startTime;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const velocity = absX / Math.max(1, elapsed);

    state.valid = false;
    if (pillRef.current) pillRef.current.style.display = 'none';

    if (state.ignoreLeftSwipe && deltaX < 0) {
      return;
    }

    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

    const isValidSwipe =
      (absX >= Math.max(50, windowWidth * 0.14) || (velocity > 0.24 && absX >= 26 && elapsed < 320)) &&
      absX > absY * 1.8 &&
      elapsed < 650;

    const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);

    if (isValidSwipe && currentIndex !== -1) {
      if (deltaX > 0 && currentIndex < MAIN_TABS.length - 1) {
        // Swipe Kanan -> Tab berikutnya
        isNavigatingRef.current = true;
        navigationTriggerRef.current = 'swipe-right';
        const nextRoute = MAIN_TABS[currentIndex + 1];

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }

        // Bersihkan transform inline agar transition controller mengambil alih secara penuh
        if (contentRef.current) {
          contentRef.current.style.transform = '';
          contentRef.current.style.transition = '';
        }

        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 450);

        router.push(nextRoute);
        return;
      } else if (deltaX < 0 && currentIndex > 0) {
        // Swipe Kiri -> Tab sebelumnya
        isNavigatingRef.current = true;
        navigationTriggerRef.current = 'swipe-left';
        const prevRoute = MAIN_TABS[currentIndex - 1];

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }

        // Bersihkan transform inline agar transition controller mengambil alih secara penuh
        if (contentRef.current) {
          contentRef.current.style.transform = '';
          contentRef.current.style.transition = '';
        }

        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 450);

        router.push(prevRoute);
        return;
      }
    }

    // Jika tidak memenuhi ambang perpindahan, kembalikan posisi dengan spring-back
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, [normalizedCurrent, pageStack.isTransitioning, router]);

  const handleTouchCancel = useCallback(() => {
    touchStateRef.current.valid = false;
    isNavigatingRef.current = false;
    if (pillRef.current) pillRef.current.style.display = 'none';
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
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
      {/* Indikator nama tab tujuan melayang di atas bottom navigation bar (tidak menutupi filter/header) */}
      <div
        ref={pillRef}
        style={{ display: 'none' }}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-[11px] font-semibold px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-xs pointer-events-none tracking-wide transition-opacity"
      />

      {/* Transition Controller: Render dua halaman secara kontinu saat berpindah rute */}
      {pageStack.isTransitioning ? (
        <div className="flex-1 relative w-full overflow-hidden flex flex-col min-w-0">
          {/* Halaman Sebelumnya (Bergerak Keluar) */}
          <div
            className={`absolute inset-0 w-full h-full overflow-y-auto ${
              pageStack.direction === 'slide-right'
                ? 'animate-page-slide-out-right'
                : 'animate-page-slide-out-left'
            }`}
            style={{ willChange: 'transform, opacity' }}
          >
            {pageStack.leavingNode}
          </div>

          {/* Halaman Tujuan (Bergerak Masuk) */}
          <div
            onAnimationEnd={handleTransitionEnd}
            className={`absolute inset-0 w-full h-full overflow-y-auto ${
              pageStack.direction === 'slide-right'
                ? 'animate-page-slide-in-left'
                : 'animate-page-slide-in-right'
            }`}
            style={{ willChange: 'transform, opacity' }}
          >
            {pageStack.currentNode}
          </div>
        </div>
      ) : (
        /* Status Normal: Satu halaman dalam aliran dokumen alami */
        <div
          ref={contentRef}
          className="flex-1 flex flex-col min-w-0 w-full"
        >
          {pageStack.currentNode}
        </div>
      )}
    </div>
  );
}
