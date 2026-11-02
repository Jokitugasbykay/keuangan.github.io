'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MAIN_TABS, TAB_NAMES, normalizePath } from '@/lib/navigation';

const TOUCH_SLOP = 10;      // Jarak minimal pixel sebelum gesture diklasifikasikan
const EDGE_ZONE = 18;       // Proteksi tepi untuk touch gesture sistem mobile
const SLIDE_DURATION = 280; // Durasi transisi slide antarhalaman (ms)

/**
 * @typedef {Object} SwipeNavigationProps
 * @property {React.ReactNode} children
 */

/**
 * Transition Controller navigasi swipe dua halaman Kayla Finance berbasis Pointer Events.
 * Kompatibel dengan Touchscreen HP, Laptop Touchscreen, Stylus/Pen, dan Mouse drag desktop.
 * 
 * Urutan navigasi alami:
 * Swipe Kanan (deltaX > 0): Dashboard -> Akun -> Transaksi -> MT5 -> Laporan.
 * Swipe Kiri (deltaX < 0): Laporan -> MT5 -> Transaksi -> Akun -> Dashboard.
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
  const contentRef = useRef(null);
  const pillRef = useRef(null);
  const isNavigatingRef = useRef(false);

  // Status gesture pointer tunggal
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
    isVertical: false,
    captured: false,
    active: false,
  });

  // Helper pencatat debug instrumentation di development mode (tanpa data finansial pribadi)
  const logGestureDebug = useCallback((data) => {
    if (typeof window !== 'undefined') {
      const g = /** @type {any} */ (window);
      g.__KAYLA_GESTURE_DEBUG__ = g.__KAYLA_GESTURE_DEBUG__ || [];
      g.__KAYLA_GESTURE_DEBUG__.push({
        time: Date.now(),
        ...data,
      });
      if (g.__KAYLA_GESTURE_DEBUG__.length > 50) {
        g.__KAYLA_GESTURE_DEBUG__.shift();
      }
    }
  }, []);

  // Sinkronisasi perpindahan halaman secara langsung saat pathname berubah
  if (normalizedCurrent !== pageStack.currentKey) {
    const prevIndex = MAIN_TABS.indexOf(pageStack.currentKey);
    const currIndex = MAIN_TABS.indexOf(normalizedCurrent);
    const trigger = navigationTriggerRef.current;
    navigationTriggerRef.current = 'none';

    let direction = 'slide-left';
    if (trigger === 'swipe-right') {
      // Swipe kanan (deltaX > 0): halaman lama keluar ke kanan, halaman baru masuk dari kiri
      direction = 'slide-right';
    } else if (trigger === 'swipe-left') {
      // Swipe kiri (deltaX < 0): halaman lama keluar ke kiri, halaman baru masuk dari kanan
      direction = 'slide-left';
    } else {
      // Klik Bottom Navigation atau link menu:
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

  // Update currentNode jika children berubah pada rute yang sama (misal fetch data selesai)
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
      }, SLIDE_DURATION + 40);
      return () => clearTimeout(timer);
    }
  }, [pageStack.isTransitioning]);

  // Pembersihan inline transform dan status navigasi saat rute berubah
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
      pillRef.current.style.opacity = '0';
      pillRef.current.style.transform = 'translate(-50%, 6px) scale(0.95)';
    }
  }, [normalizedCurrent]);

  // Pointer Down: Titik awal gesture
  const handlePointerDown = useCallback((e) => {
    // Mouse: hanya tombol primer kiri (button 0)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isNavigatingRef.current || pageStack.isTransitioning) return;

    const target = /** @type {HTMLElement | null} */ (e.target);
    if (target) {
      // Abaikan jika pointer berada di kontrol interaktif atau elemen scroll horizontal
      const isInteractive = target.closest(
        'input, textarea, select, button, a, [role="button"], [role="slider"], [role="dialog"], [role="tab"], [role="listbox"], [role="option"], .recharts-wrapper, svg, table, .overflow-x-auto, [data-swipe-ignore="true"]'
      );
      if (isInteractive) return;
    }

    // Proteksi tepi layar khusus perangkat sentuh (iOS back swipe, Android gesture pill)
    if (e.pointerType === 'touch') {
      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
      if (e.clientX < EDGE_ZONE || e.clientX > windowWidth - EDGE_ZONE) {
        return;
      }
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
      isVertical: false,
      captured: false,
      active: true,
    };
  }, [pageStack.isTransitioning]);

  // Pointer Move: Deteksi arah dan umpan balik live tracking
  const handlePointerMove = useCallback((e) => {
    const gesture = gestureRef.current;
    if (!gesture.active || e.pointerId !== gesture.pointerId) return;

    // Untuk mouse: pastikan tombol kiri tetap ditekan
    if (gesture.pointerType === 'mouse' && (e.buttons & 1) !== 1) {
      gesture.active = false;
      if (contentRef.current) {
        contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        contentRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      if (pillRef.current) {
        pillRef.current.style.opacity = '0';
        pillRef.current.style.transform = 'translate(-50%, 6px) scale(0.95)';
      }
      return;
    }

    gesture.currentX = e.clientX;
    gesture.currentY = e.clientY;

    const deltaX = gesture.currentX - gesture.startX;
    const deltaY = gesture.currentY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Tahap 1: Klasifikasi Arah Gesture
    if (!gesture.classified) {
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < TOUCH_SLOP) return;

      if (absY > absX * 0.75) {
        // Dominan vertikal: serahkan ke scroll dokumen bawaan
        gesture.isVertical = true;
        gesture.classified = true;
        gesture.active = false;
        logGestureDebug({
          pointerType: gesture.pointerType,
          startX: gesture.startX,
          startY: gesture.startY,
          endX: gesture.currentX,
          endY: gesture.currentY,
          deltaX,
          deltaY,
          classification: 'vertical-scroll',
          currentRoute: normalizedCurrent,
          targetRoute: null,
          direction: 'none',
          animationStatus: 'ignored',
        });
        return;
      }

      if (absX >= TOUCH_SLOP && absX > absY * 1.4) {
        // Terkonfirmasi swipe horizontal
        gesture.isHorizontal = true;
        gesture.classified = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
          gesture.captured = true;
        } catch (_) {}
      } else {
        // Gerakan diagonal ambigu: abaikan agar tidak terjadi salah swipe
        gesture.isVertical = true;
        gesture.classified = true;
        gesture.active = false;
        return;
      }
    }

    // Tahap 2: Live Feedback Mengikuti Pointer
    if (gesture.isHorizontal) {
      const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);
      const isRight = deltaX > 0;
      const isLeft = deltaX < 0;
      const hasNext = currentIndex !== -1 && currentIndex < MAIN_TABS.length - 1;
      const hasPrev = currentIndex !== -1 && currentIndex > 0;
      const isValidDirection = (isRight && hasNext) || (isLeft && hasPrev);

      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

      let offset = 0;
      if (isValidDirection) {
        // Respon langsung mengikuti pointer hingga 70% lebar layar
        const maxDrag = windowWidth * 0.70;
        offset = Math.sign(deltaX) * Math.min(maxDrag, absX * 0.88);
      } else {
        // Redaman halus elastis pada batas ujung halaman
        offset = Math.sign(deltaX) * Math.min(22, Math.pow(absX, 0.5) * 2.2);
      }

      if (contentRef.current) {
        contentRef.current.style.transition = 'none';
        contentRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
      }

      // Indikator pill tab tujuan
      if (pillRef.current) {
        if (deltaX > 25 && hasNext) {
          pillRef.current.textContent = `${TAB_NAMES[MAIN_TABS[currentIndex + 1]] || ''} →`;
          pillRef.current.style.opacity = '1';
          pillRef.current.style.transform = 'translate(-50%, 0) scale(1)';
        } else if (deltaX < -25 && hasPrev) {
          pillRef.current.textContent = `← ${TAB_NAMES[MAIN_TABS[currentIndex - 1]] || ''}`;
          pillRef.current.style.opacity = '1';
          pillRef.current.style.transform = 'translate(-50%, 0) scale(1)';
        } else {
          pillRef.current.style.opacity = '0';
          pillRef.current.style.transform = 'translate(-50%, 6px) scale(0.95)';
        }
      }
    }
  }, [normalizedCurrent, logGestureDebug]);

  // Pointer Up: Putuskan navigasi atau spring-back
  const handlePointerUp = useCallback((e) => {
    const gesture = gestureRef.current;
    if (gesture.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }

    if (!gesture.active || !gesture.isHorizontal || isNavigatingRef.current || pageStack.isTransitioning) {
      gesture.active = false;
      if (pillRef.current) {
        pillRef.current.style.opacity = '0';
        pillRef.current.style.transform = 'translate(-50%, 6px) scale(0.95)';
      }
      if (contentRef.current) {
        contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        contentRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      return;
    }

    gesture.active = false;
    const deltaX = gesture.currentX - gesture.startX;
    const deltaY = gesture.currentY - gesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const elapsed = Date.now() - gesture.startTime;
    const velocity = absX / Math.max(1, elapsed);
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

    if (pillRef.current) {
      pillRef.current.style.opacity = '0';
      pillRef.current.style.transform = 'translate(-50%, 6px) scale(0.95)';
    }

    // Ambang swipe valid: jarak mencukupi (15% lebar layar) atau flick cepat
    const isConfirmedSwipe =
      (absX >= Math.min(50, windowWidth * 0.15) || (velocity > 0.26 && absX >= 24 && elapsed < 360)) &&
      absX > absY * 1.3 &&
      elapsed < 750;

    const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);

    if (isConfirmedSwipe && currentIndex !== -1) {
      if (deltaX > 0 && currentIndex < MAIN_TABS.length - 1) {
        // Swipe Kanan -> Tab berikutnya
        const nextRoute = MAIN_TABS[currentIndex + 1];
        isNavigatingRef.current = true;
        navigationTriggerRef.current = 'swipe-right';

        logGestureDebug({
          pointerType: gesture.pointerType,
          startX: gesture.startX,
          startY: gesture.startY,
          endX: gesture.currentX,
          endY: gesture.currentY,
          deltaX,
          deltaY,
          classification: 'horizontal-swipe',
          currentRoute: normalizedCurrent,
          targetRoute: nextRoute,
          direction: 'swipe-right',
          animationStatus: 'navigating',
        });

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch (_) {}
        }

        // Lanjutkan transisi keluar secara mulus mengikuti arah pergeseran
        if (contentRef.current) {
          contentRef.current.style.transition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';
          contentRef.current.style.transform = 'translate3d(100%, 0, 0)';
        }

        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 500);

        router.push(nextRoute);
        return;
      } else if (deltaX < 0 && currentIndex > 0) {
        // Swipe Kiri -> Tab sebelumnya
        const prevRoute = MAIN_TABS[currentIndex - 1];
        isNavigatingRef.current = true;
        navigationTriggerRef.current = 'swipe-left';

        logGestureDebug({
          pointerType: gesture.pointerType,
          startX: gesture.startX,
          startY: gesture.startY,
          endX: gesture.currentX,
          endY: gesture.currentY,
          deltaX,
          deltaY,
          classification: 'horizontal-swipe',
          currentRoute: normalizedCurrent,
          targetRoute: prevRoute,
          direction: 'swipe-left',
          animationStatus: 'navigating',
        });

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch (_) {}
        }

        // Lanjutkan transisi keluar secara mulus mengikuti arah pergeseran
        if (contentRef.current) {
          contentRef.current.style.transition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';
          contentRef.current.style.transform = 'translate3d(-100%, 0, 0)';
        }

        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          isNavigatingRef.current = false;
        }, 500);

        router.push(prevRoute);
        return;
      }
    }

    // Jika tidak mencapai ambang batas: kembalikan ke posisi normal dengan spring-back
    logGestureDebug({
      pointerType: gesture.pointerType,
      startX: gesture.startX,
      startY: gesture.startY,
      endX: gesture.currentX,
      endY: gesture.currentY,
      deltaX,
      deltaY,
      classification: isConfirmedSwipe ? 'boundary-stop' : 'cancelled-swipe',
      currentRoute: normalizedCurrent,
      targetRoute: null,
      direction: 'none',
      animationStatus: 'spring-back',
    });

    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, [normalizedCurrent, pageStack.isTransitioning, router, logGestureDebug]);

  // Pointer Cancel: Batalkan gesture dan reset posisi
  const handlePointerCancel = useCallback((e) => {
    const gesture = gestureRef.current;
    if (gesture.captured) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }
    gesture.active = false;
    isNavigatingRef.current = false;
    if (pillRef.current) {
      pillRef.current.style.opacity = '0';
      pillRef.current.style.transform = 'translate(-50%, 6px) scale(0.95)';
    }
    if (contentRef.current) {
      contentRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      contentRef.current.style.transform = 'translate3d(0, 0, 0)';
    }
  }, []);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className="flex-1 flex flex-col min-w-0 w-full relative overflow-x-hidden touch-pan-y"
      style={{ touchAction: 'pan-y pinch-zoom' }}
    >
      {/* Indikator nama tab tujuan melayang di atas bottom navigation bar (tidak menutupi filter/header) */}
      <div
        ref={pillRef}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 text-white text-[11px] font-semibold px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-xs pointer-events-none tracking-wide transition-all duration-150 opacity-0 transform -translate-y-1 scale-95"
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
