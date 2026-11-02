'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MAIN_TABS, normalizePath } from '@/lib/navigation';
import TabPreview from '@/components/previews/TabPreview';

const TOUCH_SLOP = 10;      // Jarak minimal pixel sebelum gesture diklasifikasikan
const EDGE_ZONE = 18;       // Proteksi tepi untuk touch gesture sistem mobile
const SLIDE_DURATION = 280; // Durasi transisi slide antarhalaman (ms)

/**
 * @typedef {Object} SwipeNavigationProps
 * @property {React.ReactNode} children
 */

/**
 * Transition Controller navigasi swipe dua halaman Kayla Finance bergaya iPhone dengan Live Tab Preview.
 * 
 * Aturan gesture konsisten:
 * Swipe Kiri (deltaX < 0)  -> Ke tab berikutnya (Dashboard -> Akun -> Transaksi -> MT5 -> Laporan)
 * Swipe Kanan (deltaX > 0) -> Ke tab sebelumnya (Laporan -> MT5 -> Transaksi -> Akun -> Dashboard)
 * 
 * @param {SwipeNavigationProps} props
 * @returns {React.ReactElement}
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const normalizedCurrent = normalizePath(pathname);

  // Status deteksi mobile (< 768px). Default false untuk SSR & initial render agar hydration cocok.
  const [isMobile, setIsMobile] = useState(false);

  // Stack halaman untuk transisi saat navigasi via link / Bottom Navigation bar
  const [pageStack, setPageStack] = useState(() => ({
    currentKey: normalizedCurrent,
    currentNode: children,
    leavingKey: null,
    leavingNode: null,
    direction: 'none', // 'slide-left' | 'slide-right' | 'none'
    isTransitioning: false,
  }));

  // State preview halaman tujuan yang bergerak live mengikuti pergeseran jari
  const [previewState, setPreviewState] = useState({
    route: null,
    direction: 'none', // 'from-right' (swipe kiri) | 'from-left' (swipe kanan)
  });

  const navigationTriggerRef = useRef('none');
  const navTimeoutRef = useRef(null);
  const currentPanelRef = useRef(null);
  const previewPanelRef = useRef(null);
  const dimmerRef = useRef(null);
  const isNavigatingRef = useRef(false);

  // Listener reaktif perubahan ukuran layar dan media query mobile (768px)
  useEffect(() => {
    const checkMobile = () => {
      const mobileNow = window.innerWidth < 768;
      setIsMobile((prev) => {
        if (prev && !mobileNow) {
          // Beralih dari mobile ke desktop: bersihkan seluruh state gesture & preview
          gestureRef.current.active = false;
          isNavigatingRef.current = false;
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
          setPreviewState({ route: null, direction: 'none' });
          setPageStack((p) => ({
            ...p,
            leavingKey: null,
            leavingNode: null,
            direction: 'none',
            isTransitioning: false,
          }));
        }
        return mobileNow;
      });
    };

    checkMobile();

    const mql = window.matchMedia('(max-width: 767px)');
    const mqlHandler = () => {
      checkMobile();
    };

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
    targetRoute: null,
    previewDirection: 'none',
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

    if (!isMobile || trigger === 'gesture-swipe') {
      // Pada Desktop atau setelah commit gesture swipe:
      // Langsung perbarui stack tanpa memicu animasi transisi dua halaman
      setPageStack({
        currentKey: normalizedCurrent,
        currentNode: children,
        leavingKey: null,
        leavingNode: null,
        direction: 'none',
        isTransitioning: false,
      });
    } else {
      // Khusus Mobile: Klik Bottom Navigation atau link menu:
      // Index lebih tinggi: bergerak ke kiri (masuk dari kanan)
      // Index lebih rendah: bergerak ke kanan (masuk dari kiri)
      const direction = currIndex > prevIndex ? 'slide-left' : 'slide-right';

      setPageStack({
        currentKey: normalizedCurrent,
        currentNode: children,
        leavingKey: pageStack.currentKey,
        leavingNode: pageStack.currentNode,
        direction,
        isTransitioning: true,
      });
    }
  }

  // Update currentNode jika children berubah pada rute yang sama (misal fetch data selesai)
  useEffect(() => {
    if (pageStack.currentKey === normalizedCurrent && pageStack.currentNode !== children) {
      setPageStack((prev) => ({ ...prev, currentNode: children }));
    }
  }, [children, normalizedCurrent, pageStack.currentKey, pageStack.currentNode]);

  // Akhiri transisi klik Bottom Navigation saat animasi CSS selesai
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

    // Reset panel aktif
    if (currentPanelRef.current) {
      currentPanelRef.current.style.transform = '';
      currentPanelRef.current.style.transition = '';
    }
    // Sembunyikan preview
    setPreviewState({ route: null, direction: 'none' });
    if (dimmerRef.current) {
      dimmerRef.current.style.opacity = '0';
      dimmerRef.current.style.transition = '';
    }
  }, [normalizedCurrent]);

  // Pointer Down: Titik awal gesture
  const handlePointerDown = useCallback((e) => {
    if (!isMobile) return;
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
      targetRoute: null,
      previewDirection: 'none',
    };
  }, [isMobile, pageStack.isTransitioning]);

  // Pointer Move: Deteksi arah dan umpan balik live tracking
  const handlePointerMove = useCallback((e) => {
    if (!isMobile) return;
    const gesture = gestureRef.current;
    if (!gesture.active || e.pointerId !== gesture.pointerId) return;

    // Untuk mouse: pastikan tombol kiri tetap ditekan
    if (gesture.pointerType === 'mouse' && (e.buttons & 1) !== 1) {
      gesture.active = false;
      if (currentPanelRef.current) {
        currentPanelRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        currentPanelRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      if (previewPanelRef.current) {
        previewPanelRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        const startPos = gesture.previewDirection === 'from-right' ? '100%' : '-100%';
        previewPanelRef.current.style.transform = `translate3d(${startPos}, 0, 0)`;
      }
      if (dimmerRef.current) {
        dimmerRef.current.style.opacity = '0';
      }
      setTimeout(() => {
        setPreviewState({ route: null, direction: 'none' });
      }, 240);
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

    // Tahap 2: Live Tracking Mengikuti Pointer (Gaya iPhone dengan Live Preview)
    if (gesture.isHorizontal) {
      const currentIndex = MAIN_TABS.indexOf(normalizedCurrent);
      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 360;

      // ATURAN ARAH KONSISTEN:
      // Swipe Kiri (deltaX < 0)  -> Ke tab berikutnya (currentIndex + 1)
      // Swipe Kanan (deltaX > 0) -> Ke tab sebelumnya (currentIndex - 1)
      let targetRoute = null;
      let previewDir = 'none';

      if (deltaX < 0 && currentIndex !== -1 && currentIndex < MAIN_TABS.length - 1) {
        // Swipe Kiri: Target tab berikutnya, preview masuk dari sisi KANAN (+100%)
        targetRoute = MAIN_TABS[currentIndex + 1];
        previewDir = 'from-right';
      } else if (deltaX > 0 && currentIndex > 0) {
        // Swipe Kanan: Target tab sebelumnya, preview masuk dari sisi KIRI (-100%)
        targetRoute = MAIN_TABS[currentIndex - 1];
        previewDir = 'from-left';
      }

      gesture.targetRoute = targetRoute;
      gesture.previewDirection = previewDir;

      if (targetRoute) {
        // Pastikan komponen preview halaman tujuan termount
        if (previewState.route !== targetRoute || previewState.direction !== previewDir) {
          setPreviewState({ route: targetRoute, direction: previewDir });
        }

        // Pergeseran proporsional 1:1 mengikuti jari
        const currentOffset = deltaX;
        if (currentPanelRef.current) {
          currentPanelRef.current.style.transition = 'none';
          currentPanelRef.current.style.transform = `translate3d(${currentOffset}px, 0, 0)`;
        }

        if (previewPanelRef.current) {
          previewPanelRef.current.style.transition = 'none';
          if (previewDir === 'from-right') {
            // Preview berada di sisi kanan (100% + deltaX)
            previewPanelRef.current.style.transform = `translate3d(calc(100% + ${currentOffset}px), 0, 0)`;
          } else {
            // Preview berada di sisi kiri (-100% + deltaX)
            previewPanelRef.current.style.transform = `translate3d(calc(-100% + ${currentOffset}px), 0, 0)`;
          }
        }

        // Dimmer depth overlay di panel aktif
        if (dimmerRef.current) {
          dimmerRef.current.style.transition = 'none';
          const dimProgress = Math.min(0.25, (absX / windowWidth) * 0.32);
          dimmerRef.current.style.opacity = `${dimProgress}`;
        }
      } else {
        // Batas ujung halaman: Redaman elastis lembut (rubber-band) tanpa preview
        const offset = Math.sign(deltaX) * Math.min(22, Math.pow(absX, 0.5) * 2.2);
        if (currentPanelRef.current) {
          currentPanelRef.current.style.transition = 'none';
          currentPanelRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
        }
        if (dimmerRef.current) {
          dimmerRef.current.style.opacity = '0';
        }
      }
    }
  }, [isMobile, normalizedCurrent, previewState.route, previewState.direction, logGestureDebug]);

  // Pointer Up: Putuskan commit navigasi atau spring-back
  const handlePointerUp = useCallback((e) => {
    if (!isMobile) return;
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
      if (currentPanelRef.current) {
        currentPanelRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        currentPanelRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
      if (previewPanelRef.current) {
        previewPanelRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        const startPos = gesture.previewDirection === 'from-right' ? '100%' : '-100%';
        previewPanelRef.current.style.transform = `translate3d(${startPos}, 0, 0)`;
      }
      if (dimmerRef.current) {
        dimmerRef.current.style.opacity = '0';
      }
      setTimeout(() => {
        setPreviewState({ route: null, direction: 'none' });
      }, 240);
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

    // Ambang swipe valid: jarak mencukupi (16% lebar layar) atau flick cepat
    const isConfirmedSwipe =
      (absX >= Math.min(50, windowWidth * 0.16) || (velocity > 0.28 && absX >= 24 && elapsed < 350)) &&
      absX > absY * 1.3 &&
      elapsed < 750;

    const targetRoute = gesture.targetRoute;
    const previewDir = gesture.previewDirection;

    if (isConfirmedSwipe && targetRoute) {
      // COMMIT TRANSITION: Lanjutkan gerakan hingga halaman tujuan mengambil alih penuh (0%)
      isNavigatingRef.current = true;
      navigationTriggerRef.current = 'gesture-swipe';

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
        targetRoute,
        direction: deltaX < 0 ? 'swipe-left' : 'swipe-right',
        animationStatus: 'committing-live-preview',
      });

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(10); } catch (_) {}
      }

      // Animasi transisi keluar untuk panel aktif
      if (currentPanelRef.current) {
        currentPanelRef.current.style.transition = 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        const exitPos = deltaX < 0 ? '-100%' : '100%';
        currentPanelRef.current.style.transform = `translate3d(${exitPos}, 0, 0)`;
      }

      // Animasi transisi masuk untuk preview tujuan ke posisi 0%
      if (previewPanelRef.current) {
        previewPanelRef.current.style.transition = 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1)';
        previewPanelRef.current.style.transform = 'translate3d(0%, 0, 0)';
      }

      if (dimmerRef.current) {
        dimmerRef.current.style.transition = 'opacity 260ms ease-out';
        dimmerRef.current.style.opacity = '0';
      }

      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = setTimeout(() => {
        router.push(targetRoute);
      }, 260);

      return;
    }

    // BATAL / TIDAK MENCAPAI THRESHOLD: Spring-back halus ke posisi asal
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

    if (currentPanelRef.current) {
      currentPanelRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      currentPanelRef.current.style.transform = 'translate3d(0, 0, 0)';
    }

    if (previewPanelRef.current) {
      previewPanelRef.current.style.transition = 'transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      const startPos = previewDir === 'from-right' ? '100%' : '-100%';
      previewPanelRef.current.style.transform = `translate3d(${startPos}, 0, 0)`;
    }

    if (dimmerRef.current) {
      dimmerRef.current.style.transition = 'opacity 240ms ease-out';
      dimmerRef.current.style.opacity = '0';
    }

    setTimeout(() => {
      setPreviewState({ route: null, direction: 'none' });
    }, 240);
  }, [isMobile, normalizedCurrent, pageStack.isTransitioning, router, logGestureDebug]);

  // Pointer Cancel: Batalkan gesture dan reset posisi
  const handlePointerCancel = useCallback((e) => {
    if (!isMobile) return;
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

    if (currentPanelRef.current) {
      currentPanelRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      currentPanelRef.current.style.transform = 'translate3d(0, 0, 0)';
    }

    if (previewPanelRef.current) {
      previewPanelRef.current.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1)';
      const startPos = gesture.previewDirection === 'from-right' ? '100%' : '-100%';
      previewPanelRef.current.style.transform = `translate3d(${startPos}, 0, 0)`;
    }

    if (dimmerRef.current) {
      dimmerRef.current.style.opacity = '0';
    }

    setTimeout(() => {
      setPreviewState({ route: null, direction: 'none' });
    }, 200);
  }, [isMobile]);

  // TAMPILAN DESKTOP (>= 768px):
  // Bersih dan instan tanpa pointer listener, tanpa live preview, tanpa animasi transisi atau transform
  if (!isMobile) {
    return (
      <div className="flex-1 flex flex-col min-w-0 w-full">
        {children}
      </div>
    );
  }

  // TAMPILAN MOBILE (< 768px):
  // Navigasi swipe bergaya iPhone dengan Live Tab Preview dan animasi slide halus
  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className="flex-1 flex flex-col min-w-0 w-full relative overflow-x-hidden touch-pan-y"
      style={{ touchAction: 'pan-y pinch-zoom' }}
    >
      {/* Container Dua Panel: Panel Halaman Aktif + Panel Preview Halaman Tujuan */}
      <div className="flex-1 flex flex-col min-w-0 w-full relative overflow-x-hidden">
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

          {pageStack.isTransitioning ? (
            /* Transisi klik Bottom Navigation / Menu */
            <div className="flex-1 relative w-full overflow-hidden flex flex-col min-w-0">
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
            /* Aliran dokumen normal */
            pageStack.currentNode
          )}
        </div>

        {/* Panel Preview Halaman Tujuan (Muncul secara sinkron saat swipe berlangsung) */}
        {previewState.route && (
          <div
            ref={previewPanelRef}
            className="absolute inset-0 w-full h-full z-30 overflow-y-auto pointer-events-none select-none bg-slate-50"
            style={{
              transform: previewState.direction === 'from-right' ? 'translate3d(100%, 0, 0)' : 'translate3d(-100%, 0, 0)',
              boxShadow: previewState.direction === 'from-right'
                ? '-14px 0 32px -4px rgba(15, 23, 42, 0.16), -4px 0 10px -2px rgba(15, 23, 42, 0.1)'
                : '14px 0 32px -4px rgba(15, 23, 42, 0.16), 4px 0 10px -2px rgba(15, 23, 42, 0.1)',
              willChange: 'transform',
            }}
          >
            <TabPreview path={previewState.route} />
          </div>
        )}
      </div>
    </div>
  );
}
