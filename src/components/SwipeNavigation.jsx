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
 * Komponen navigasi swipe tab horizontal tingkat root dengan urutan alami:
 * Swipe Kanan (deltaX > 0): Dashboard -> Akun -> Transaksi -> MT5 -> Laporan.
 * Swipe Kiri (deltaX < 0): Laporan -> MT5 -> Transaksi -> Akun -> Dashboard.
 * Dilengkapi transisi sinkron bebas kedipan (no flash/blank), isolasi scroll vertikal, dan akselerasi GPU.
 * @param {SwipeNavigationProps} props
 * @returns {React.ReactElement}
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const normalizedCurrent = normalizePath(pathname);

  // Status navigasi tab dan arah animasi sinkron (dihitung saat render untuk mencegah 1-frame flash)
  const [navState, setNavState] = useState({
    currentTab: normalizedCurrent,
    direction: 'none',
  });

  const navigationTriggerRef = useRef('none');
  const navTimeoutRef = useRef(null);

  // Sinkronisasi arah transisi secara langsung saat pathname berubah
  if (normalizedCurrent !== navState.currentTab) {
    const prevIndex = MAIN_TABS.indexOf(navState.currentTab);
    const currIndex = MAIN_TABS.indexOf(normalizedCurrent);

    let direction = 'none';
    const trigger = navigationTriggerRef.current;
    navigationTriggerRef.current = 'none';

    if (prevIndex !== -1 && currIndex !== -1 && prevIndex !== currIndex) {
      if (trigger === 'swipe-right') {
        // Swipe ke kanan: maju ke tab berikutnya, meluncur masuk dari sisi kiri mengikuti dorongan
        direction = 'left';
      } else if (trigger === 'swipe-left') {
        // Swipe ke kiri: mundur ke tab sebelumnya, meluncur masuk dari sisi kanan
        direction = 'right';
      } else {
        // Navigasi melalui tombol bottom navigation atau link
        direction = currIndex > prevIndex ? 'right' : 'left';
      }
    }

    setNavState({
      currentTab: normalizedCurrent,
      direction,
    });
  }

  // DOM Refs untuk manipulasi GPU translate3d langsung tanpa re-render React pada touchmove
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

  // Pembersihan DOM dan batas waktu pengaman saat rute berubah
  useEffect(() => {
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }

    isNavigatingRef.current = false;

    // Bersihkan style inline pada kontainer konten
    if (contentRef.current) {
      contentRef.current.style.transform = '';
      contentRef.current.style.transition = '';
      contentRef.current.style.opacity = '';
    }
    if (pillRef.current) {
      pillRef.current.style.display = 'none';
    }
  }, [normalizedCurrent]);

  // Touch Start
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1 || isNavigatingRef.current) return;

    const touch = e.touches[0];
    const target = /** @type {HTMLElement | null} */ (e.target);

    let ignoreLeftSwipe = false;

    // Filter elemen interaktif
    if (target) {
      // Kontrol interaktif, form, tombol, dialog, chart, dan tabel scroll mengabaikan navigasi swipe
      const isHardInteractive = target.closest(
        'input, textarea, select, button, a, [role="button"], [role="dialog"], [role="slider"], [role="listbox"], [role="option"], [role="tab"], .recharts-wrapper, svg, .overflow-x-auto, table'
      );
      if (isHardInteractive) {
        touchStateRef.current.valid = false;
        return;
      }

      // Kartu transaksi swipe-to-reveal: abaikan swipe kiri agar aksi edit/hapus bisa terbuka,
      // namun tetap izinkan swipe kanan untuk navigasi ke tab berikutnya
      if (target.closest('[data-swipe-ignore="true"]')) {
        ignoreLeftSwipe = true;
      }
    }

    // Proteksi gestur tepi Android dan iOS (hindari bentrok dengan navigasi Back sistem)
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
        return;
      }

      // Kunci ke scroll vertikal jika gerakan didominasi komponen vertikal
      if (absY > absX * 0.7) {
        state.isVerticalScroll = true;
        return;
      }

      // Swipe horizontal dikunci jika arah jelas horizontal (sudut < 26 derajat)
      if (absX >= TOUCH_SLOP && absX > absY * 2.0) {
        state.isHorizontalSwipe = true;
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
        }
      } else {
        // Gerakan diagonal ambigu: utamakan kestabilan scroll halaman
        state.isVerticalScroll = true;
        return;
      }
    }

    // Jika telah terkunci sebagai scroll vertikal, jangan geser layout horizontal
    if (state.isVerticalScroll) {
      return;
    }

    // Tahap 2: Pemrosesan Swipe Horizontal
    if (state.isHorizontalSwipe) {
      // Jika kartu swipe-to-reveal digeser ke kiri, biarkan kartu menangani aksinya
      if (state.ignoreLeftSwipe && deltaX < 0) {
        return;
      }

      if (prefersReducedMotion()) return;

      // Jika di tengah swipe gerakan berbelok tajam ke arah vertikal, batalkan geseran
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

      // Urutan Navigasi Alami:
      // Swipe Kanan (deltaX > 0): Maju ke halaman berikutnya
      // Swipe Kiri (deltaX < 0): Mundur ke halaman sebelumnya
      const isSwipingRight = deltaX > 0;
      const isSwipingLeft = deltaX < 0;
      const hasNextTab = currentIndex !== -1 && currentIndex < MAIN_TABS.length - 1;
      const hasPrevTab = currentIndex !== -1 && currentIndex > 0;
      const isValidDirection = (isSwipingRight && hasNextTab) || (isSwipingLeft && hasPrevTab);

      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

      // Redaman pegas yang proporsional dan elegan:
      // Batasi pergeseran maksimal agar tidak terjadi pergeseran layout ekstrem atau area kosong
      let effectiveOffset = 0;
      if (isValidDirection) {
        const maxAllowedShift = Math.min(windowWidth * 0.15, 55);
        effectiveOffset = Math.sign(deltaX) * Math.min(maxAllowedShift, Math.pow(absX, 0.75) * 1.2);
      } else {
        // Batas elastis minimal (maks 12px) jika sudah di batas awal atau akhir
        effectiveOffset = Math.sign(deltaX) * Math.min(12, Math.pow(absX, 0.5) * 1.2);
      }

      state.currentOffset = effectiveOffset;

      // Terapkan translasi halus pada GPU
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${effectiveOffset}px, 0, 0)`;
      }

      // Tampilkan indikator nama tab tujuan
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
  }, [normalizedCurrent, prefersReducedMotion]);

  // Touch End
  const handleTouchEnd = useCallback(() => {
    const state = touchStateRef.current;
    if (!state.valid || isNavigatingRef.current || state.isVerticalScroll) {
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
    const velocity = absX / Math.max(1, elapsed); // px per ms

    state.valid = false;
    if (pillRef.current) pillRef.current.style.display = 'none';

    // Jika pada kartu transaksi terjadi swipe kiri, biarkan kartu menangani aksinya
    if (state.ignoreLeftSwipe && deltaX < 0) {
      return;
    }

    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

    // Ambang batas swipe yang presisi dan responsif:
    // 1. Geser lambat: minimal 15% lebar layar atau minimal 55px
    // 2. Geser cepat (flick): velocity > 0.25 px/ms dengan jarak minimal 28px dan waktu < 320ms
    const isValidSwipe =
      (absX >= Math.max(55, windowWidth * 0.15) || (velocity > 0.25 && absX >= 28 && elapsed < 320)) &&
      absX > absY * 1.8 &&
      elapsed < 650;

    const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);

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

        // Kembalikan posisi konten dengan lembut agar tidak timbul rongga putih kosong
        if (contentRef.current && !prefersReducedMotion()) {
          contentRef.current.style.transition = 'transform 120ms ease-out, opacity 120ms ease-out';
          contentRef.current.style.transform = 'translate3d(0, 0, 0)';
          contentRef.current.style.opacity = '0.9';
        }

        // Batas waktu pengaman jika navigasi Next.js terhambat
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 450);

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

        // Kembalikan posisi konten dengan lembut agar tidak timbul rongga putih kosong
        if (contentRef.current && !prefersReducedMotion()) {
          contentRef.current.style.transition = 'transform 120ms ease-out, opacity 120ms ease-out';
          contentRef.current.style.transform = 'translate3d(0, 0, 0)';
          contentRef.current.style.opacity = '0.9';
        }

        // Batas waktu pengaman jika navigasi Next.js terhambat
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 450);

        router.push(prevRoute);
        return;
      }
    }

    // Jika tidak memenuhi ambang batas perpindahan, kembalikan posisi dengan spring easing halus
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, [normalizedCurrent, router, prefersReducedMotion]);

  const handleTouchCancel = useCallback(() => {
    touchStateRef.current.valid = false;
    isNavigatingRef.current = false;
    if (pillRef.current) pillRef.current.style.display = 'none';
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, []);

  const handleAnimationEnd = useCallback(() => {
    setNavState((prev) => (prev.direction !== 'none' ? { ...prev, direction: 'none' } : prev));
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
        key={normalizedCurrent}
        onAnimationEnd={handleAnimationEnd}
        className={`flex-1 flex flex-col min-w-0 w-full will-change-transform ${
          navState.direction === 'right'
            ? 'animate-slide-in-right'
            : navState.direction === 'left'
            ? 'animate-slide-in-left'
            : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}
