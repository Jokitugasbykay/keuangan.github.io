'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { MAIN_TABS, normalizePath } from '@/lib/navigation';
import TabPreview from '@/components/previews/TabPreview';

const TOUCH_SLOP = 8;        // Ambang batas pixel sebelum mengunci arah gesture
const EDGE_ZONE = 18;       // Proteksi tepi layar dari gesture sistem Android / iOS

/**
 * @typedef {Object} SwipeNavigationProps
 * @property {React.ReactNode} children
 */

/**
 * Transition Controller navigasi swipe dua halaman Kayla Finance bergaya iPhone dengan Live Tab Preview.
 * 
 * Arsitektur Shell:
 * - Header: STATIS di bagian atas, tidak pernah terpengaruh gesture horizontal.
 * - Content Viewport: Bergeser secara fluid 1:1 mengikuti jari pada perangkat mobile.
 * - Bottom Navigation: STATIS di bagian bawah layar.
 * - Desktop: Bebas gesture, navigasi klik instan tanpa transform atau delay.
 * 
 * Aturan Arah Gesture:
 * - Swipe Kiri (deltaX < 0)  -> Ke tab berikutnya (Dashboard -> Akun -> Transaksi -> MT5 -> Laporan)
 * - Swipe Kanan (deltaX > 0) -> Ke tab sebelumnya (Laporan -> MT5 -> Transaksi -> Akun -> Dashboard)
 * 
 * @param {SwipeNavigationProps} props
 * @returns {React.ReactElement}
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const normalizedCurrent = normalizePath(pathname);

  // Status deteksi mobile (< 768px). Default false untuk initial render / SSR agar hidrasi cocok
  const [isMobile, setIsMobile] = useState(false);

  // State rute preview halaman tujuan yang dimount ke DOM
  const [previewRoute, setPreviewRoute] = useState(null);
  const [previewDirection, setPreviewDirection] = useState('none'); // 'from-right' | 'from-left'

  const currentPanelRef = useRef(null);
  const previewPanelRef = useRef(null);
  const dimmerRef = useRef(null);
  const rafIdRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const navTimeoutRef = useRef(null);

  // Gesture state tracked purely in refs to avoid React re-renders during drag
  const gestureRef = useRef({
    pointerId: -1,
    pointerType: '',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    classified: false,
    isHorizontal: false,
    captured: false,
    active: false,
    targetRoute: null,
    previewDir: 'none',
    windowWidth: 360,
  });

  // Listener reaktif perubahan ukuran layar dan media query mobile (768px)
  useEffect(() => {
    const checkMobile = () => {
      const mobileNow = window.innerWidth < 768;
      setIsMobile((prev) => {
        if (prev && !mobileNow) {
          // Beralih ke desktop: reset seluruh state transform dan preview
          gestureRef.current.active = false;
          isNavigatingRef.current = false;
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          if (navTimeoutRef.current) {
            clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = null;
          }
          if (currentPanelRef.current) {
            currentPanelRef.current.style.transform = '';
            currentPanelRef.current.style.transition = '';
          }
          if (previewPanelRef.current) {
            previewPanelRef.current.style.transform = '';
            previewPanelRef.current.style.transition = '';
          }
          if (dimmerRef.current) {
            dimmerRef.current.style.opacity = '0';
            dimmerRef.current.style.transition = '';
          }
          setPreviewRoute(null);
          setPreviewDirection('none');
        }
        return mobileNow;
      });
    };

    checkMobile();

    const mql = window.matchMedia('(max-width: 767px)');
    const mqlHandler = () => checkMobile();

    if (mql.addEventListener) {
      mql.addEventListener('change', mqlHandler);
    } else {
      mql.addListener(mqlHandler);
    }

    window.addEventListener('resize', checkMobile);

    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', mqlHandler);
      } else {
        mql.removeListener(mqlHandler);
      }
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Sinkronisasi pembersihan posisi saat rute selesai berganti di Next.js
  useEffect(() => {
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }
    isNavigatingRef.current = false;

    // Reset transform panel aktif
    if (currentPanelRef.current) {
      currentPanelRef.current.style.transition = '';
      currentPanelRef.current.style.transform = '';
    }

    // Reset panel preview
    if (previewPanelRef.current) {
      previewPanelRef.current.style.transition = '';
      previewPanelRef.current.style.transform = '';
    }
    setPreviewRoute(null);
    setPreviewDirection('none');

    if (dimmerRef.current) {
      dimmerRef.current.style.transition = '';
      dimmerRef.current.style.opacity = '0';
    }
  }, [normalizedCurrent]);

  // Pointer Down: Inisialisasi koordinat gesture
  const handlePointerDown = useCallback((e) => {
    if (!isMobile) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isNavigatingRef.current) return;

    const target = /** @type {HTMLElement | null} */ (e.target);
    if (target) {
      // Abaikan jika pointer berada di kontrol interaktif atau area scroll horizontal
      const isInteractive = target.closest(
        'input, textarea, select, button, a, [role="button"], [role="slider"], [role="dialog"], [role="tab"], [role="listbox"], [role="option"], .recharts-wrapper, svg, table, .overflow-x-auto, [data-swipe-ignore="true"]'
      );
      if (isInteractive) return;
    }

    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    if (e.pointerType === 'touch') {
      if (e.clientX < EDGE_ZONE || e.clientX > windowWidth - EDGE_ZONE) {
        return;
      }
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    gestureRef.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      startTime: Date.now(),
      classified: false,
      isHorizontal: false,
      captured: false,
      active: true,
      targetRoute: null,
      previewDir: 'none',
      windowWidth,
    };
  }, [isMobile]);

  // Pointer Cancel: Batalkan gesture dan reset posisi
  const handlePointerCancel = useCallback((e) => {
    if (!isMobile) return;
    const g = gestureRef.current;
    if (g.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    g.active = false;
    isNavigatingRef.current = false;

    if (currentPanelRef.current) {
      currentPanelRef.current.style.transition = 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)';
      currentPanelRef.current.style.transform = 'translate3d(0, 0, 0)';
    }

    if (previewPanelRef.current) {
      previewPanelRef.current.style.transition = 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)';
      const initialPreviewX = g.previewDir === 'from-right' ? g.windowWidth : -g.windowWidth;
      previewPanelRef.current.style.transform = `translate3d(${initialPreviewX}px, 0, 0)`;
    }

    if (dimmerRef.current) {
      dimmerRef.current.style.opacity = '0';
    }

    setTimeout(() => {
      setPreviewRoute(null);
      setPreviewDirection('none');
    }, 200);
  }, [isMobile]);

  // Pointer Move: Klasifikasi arah & pelacakan visual 1:1 proporsional
  const handlePointerMove = useCallback((e) => {
    if (!isMobile) return;
    const g = gestureRef.current;
    if (!g.active || e.pointerId !== g.pointerId) return;

    if (g.pointerType === 'mouse' && (e.buttons & 1) !== 1) {
      handlePointerCancel(e);
      return;
    }

    g.currentX = e.clientX;
    g.currentY = e.clientY;

    const deltaX = g.currentX - g.startX;
    const deltaY = g.currentY - g.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Tahap 1: Penguncian arah gesture (Direction Locking)
    if (!g.classified) {
      const dist = Math.hypot(deltaX, deltaY);
      if (dist < TOUCH_SLOP) return;

      if (absY > absX * 0.8) {
        // Dominan vertikal: serahkan pada scroll dokumen bawaan peramban
        g.classified = true;
        g.active = false;
        return;
      }

      if (absX >= TOUCH_SLOP && absX > absY * 1.25) {
        // Terkonfirmasi swipe horizontal
        g.isHorizontal = true;
        g.classified = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
          g.captured = true;
        } catch (_) {}
      } else {
        // Gerakan diagonal ambigu: abaikan
        g.classified = true;
        g.active = false;
        return;
      }
    }

    // Tahap 2: Pelacakan visual 1:1 mengikuti jari secara proporsional via RAF
    if (g.isHorizontal) {
      const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);
      const width = g.windowWidth;

      let targetRoute = null;
      let previewDir = 'none';

      // Aturan Navigasi:
      // Swipe kiri (deltaX < 0) -> Tab berikutnya, preview masuk dari kanan (+width)
      // Swipe kanan (deltaX > 0) -> Tab sebelumnya, preview masuk dari kiri (-width)
      if (deltaX < 0 && currentIndex !== -1 && currentIndex < MAIN_TABS.length - 1) {
        targetRoute = MAIN_TABS[currentIndex + 1];
        previewDir = 'from-right';
      } else if (deltaX > 0 && currentIndex > 0) {
        targetRoute = MAIN_TABS[currentIndex - 1];
        previewDir = 'from-left';
      }

      g.targetRoute = targetRoute;
      g.previewDir = previewDir;

      // Update state preview hanya jika rute berubah (tidak me-render ulang berulang-ulang)
      if (targetRoute) {
        setPreviewRoute((prev) => (prev !== targetRoute ? targetRoute : prev));
        setPreviewDirection((prev) => (prev !== previewDir ? previewDir : prev));
      } else {
        setPreviewRoute((prev) => (prev !== null ? null : prev));
      }

      // Jadwalkan transformasi DOM pada frame animasi berikutnya untuk performa stabil 60 FPS
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (!g.active || !g.isHorizontal) return;

          const currentDeltaX = g.currentX - g.startX;

          if (g.targetRoute) {
            // Pergeseran 1:1 proporsional pada content viewport
            if (currentPanelRef.current) {
              currentPanelRef.current.style.transition = 'none';
              currentPanelRef.current.style.transform = `translate3d(${currentDeltaX}px, 0, 0)`;
            }

            if (previewPanelRef.current) {
              previewPanelRef.current.style.transition = 'none';
              const initialPreviewX = g.previewDir === 'from-right' ? width : -width;
              previewPanelRef.current.style.transform = `translate3d(${initialPreviewX + currentDeltaX}px, 0, 0)`;
            }

            if (dimmerRef.current) {
              dimmerRef.current.style.transition = 'none';
              const progress = Math.min(0.2, (Math.abs(currentDeltaX) / width) * 0.25);
              dimmerRef.current.style.opacity = `${progress}`;
            }
          } else {
            // Redaman elastis (rubber-band) pada batas awal / akhir tab
            const rubberOffset = Math.sign(currentDeltaX) * Math.min(22, Math.pow(Math.abs(currentDeltaX), 0.5) * 2.2);
            if (currentPanelRef.current) {
              currentPanelRef.current.style.transition = 'none';
              currentPanelRef.current.style.transform = `translate3d(${rubberOffset}px, 0, 0)`;
            }
          }
        });
      }
    }
  }, [isMobile, normalizedCurrent, handlePointerCancel]);

  // Pointer Up: Selesaikan navigasi atau lakukan spring-back halus
  const handlePointerUp = useCallback((e) => {
    if (!isMobile) return;
    const g = gestureRef.current;
    if (g.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (!g.active || !g.isHorizontal || isNavigatingRef.current) {
      g.active = false;
      return;
    }

    g.active = false;
    const deltaX = g.currentX - g.startX;
    const deltaY = g.currentY - g.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const elapsed = Date.now() - g.startTime;
    const velocity = absX / Math.max(1, elapsed);
    const width = g.windowWidth;

    const targetRoute = g.targetRoute;
    const previewDir = g.previewDir;

    // Ambang konfirmasi swipe valid: jarak 20% lebar layar atau flick cepat > 0.28 px/ms
    const isConfirmed =
      targetRoute &&
      ((absX >= width * 0.20) || (velocity > 0.28 && absX >= 28 && elapsed < 400)) &&
      absX > absY * 1.25 &&
      elapsed < 800;

    if (isConfirmed && targetRoute) {
      // COMMIT NAVIGASI: Lanjutkan animasi fluid ke posisi akhir
      isNavigatingRef.current = true;

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(10); } catch (_) {}
      }

      const remainingDist = width - absX;
      const duration = Math.round(Math.min(280, Math.max(180, (remainingDist / width) * 320)));

      // Panel aktif bergeser keluar layar penuh
      if (currentPanelRef.current) {
        currentPanelRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        const exitX = deltaX < 0 ? -width : width;
        currentPanelRef.current.style.transform = `translate3d(${exitX}px, 0, 0)`;
      }

      // Panel preview masuk ke posisi 0px tepat di tengah layar
      if (previewPanelRef.current) {
        previewPanelRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        previewPanelRef.current.style.transform = 'translate3d(0px, 0, 0)';
      }

      if (dimmerRef.current) {
        dimmerRef.current.style.transition = `opacity ${duration}ms ease-out`;
        dimmerRef.current.style.opacity = '0';
      }

      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = setTimeout(() => {
        // Eksekusi perpindahan rute Next.js. Preview tetap berada di 0px hingga halaman baru termount
        router.push(targetRoute);
      }, duration);

      return;
    }

    // BATAL / TIDAK MENCAPAI THRESHOLD: Spring-back halus ke posisi asal
    const duration = Math.round(Math.min(260, Math.max(180, (absX / width) * 300)));

    if (currentPanelRef.current) {
      currentPanelRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      currentPanelRef.current.style.transform = 'translate3d(0, 0, 0)';
    }

    if (previewPanelRef.current) {
      previewPanelRef.current.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
      const initialPreviewX = previewDir === 'from-right' ? width : -width;
      previewPanelRef.current.style.transform = `translate3d(${initialPreviewX}px, 0, 0)`;
    }

    if (dimmerRef.current) {
      dimmerRef.current.style.transition = `opacity ${duration}ms ease-out`;
      dimmerRef.current.style.opacity = '0';
    }

    setTimeout(() => {
      if (!isNavigatingRef.current) {
        setPreviewRoute(null);
        setPreviewDirection('none');
      }
    }, duration);
  }, [isMobile, router]);

  // Halaman Login mandiri: bebas dari Header aplikasi dan gesture swipe
  if (normalizedCurrent === '/login' || pathname?.includes('/login')) {
    return (
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen">
        {children}
      </div>
    );
  }

  // TAMPILAN DESKTOP (>= 768px):
  // Header statis di atas, konten di bawah, bebas gesture & navigasi klik instan 0ms
  if (!isMobile) {
    return (
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen">
        <Header />
        <div className="flex-1 flex flex-col min-w-0 w-full">
          {children}
        </div>
      </div>
    );
  }

  // TAMPILAN MOBILE (< 768px):
  // Header STATIS di atas (tidak pernah bergeser), Content Viewport bergerak di bawah
  return (
    <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen relative">
      {/* 1. HEADER (STATIC) */}
      <Header />

      {/* 2. CONTENT VIEWPORT (SWIPEABLE) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="flex-1 flex flex-col min-w-0 w-full relative overflow-x-hidden touch-pan-y"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        {/* Panel Halaman Aktif */}
        <div
          ref={currentPanelRef}
          className="flex-1 flex flex-col min-w-0 w-full relative z-10"
          style={{ willChange: 'transform' }}
        >
          {/* Dimmer overlay untuk efek kedalaman layered iPhone */}
          <div
            ref={dimmerRef}
            className="absolute inset-0 bg-slate-900 pointer-events-none z-20"
            style={{ opacity: 0 }}
          />
          {children}
        </div>

        {/* Panel Preview Halaman Tujuan (Live Tab Preview) */}
        {previewRoute && (
          <div
            ref={previewPanelRef}
            className="absolute inset-0 w-full h-full z-30 overflow-y-auto pointer-events-none select-none bg-slate-50"
            style={{
              transform: previewDirection === 'from-right' ? 'translate3d(100%, 0, 0)' : 'translate3d(-100%, 0, 0)',
              boxShadow: previewDirection === 'from-right'
                ? '-14px 0 32px -4px rgba(15, 23, 42, 0.16), -4px 0 10px -2px rgba(15, 23, 42, 0.1)'
                : '14px 0 32px -4px rgba(15, 23, 42, 0.16), 4px 0 10px -2px rgba(15, 23, 42, 0.1)',
              willChange: 'transform',
            }}
          >
            <TabPreview path={previewRoute} />
          </div>
        )}
      </div>
    </div>
  );
}
