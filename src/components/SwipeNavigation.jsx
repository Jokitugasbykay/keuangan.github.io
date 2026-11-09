'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { normalizePath, getNextTab, getPreviousTab } from '@/lib/navigation';
import TabPreview from '@/components/previews/TabPreview';
import { getSwipeDecision, getSwipeSnapDuration } from '@/lib/swipe-gesture';

const TOUCH_SLOP = 9;
const EDGE_ZONE = 24;
// Jendela pendek setelah snap agar swipe beruntun tidak terputus oleh reload
// dokumen pada host static (GitHub Pages). Tidak mempengaruhi finger tracking.
const ROUTE_COMMIT_GRACE_MS = 140;
const SWIPE_CONTINUATION_KEY = 'kayla-finance:swipe-continuation';
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, [role="button"], [role="slider"], [role="dialog"], [role="tab"], [role="listbox"], [role="option"], .recharts-wrapper, svg, table, .overflow-x-auto, [data-swipe-ignore="true"]';
const SNAP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const freshGesture = () => ({
  active: false,
  pointerId: -1,
  pointerType: '',
  classified: false,
  horizontal: false,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  width: 360,
  lastX: 0,
  lastTime: 0,
  velocityX: 0,
  target: null,
  queued: false,
  basePath: null,
  pausedFirst: false,
});

function movePanel(ref, x, transition = 'none') {
  if (!ref.current) return;
  ref.current.style.transition = transition;
  ref.current.style.transform = `translate3d(${x}px, 0, 0)`;
}

/**
 * Navigasi horizontal yang mengikuti jari 1:1 seperti home screen Android.
 * Panel sebelah selalu terpasang sebelum gesture, tanpa render React saat pointer bergerak.
 * Halaman desktop dan halaman login tetap memakai navigasi biasa.
 * @param {{ children: React.ReactNode }} props
 */
export default function SwipeNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = normalizePath(pathname);
  const prevPath = getPreviousTab(currentPath);
  const nextPath = getNextTab(currentPath);

  const [isMobile, setIsMobile] = useState(false);
  const [optimisticPath, setOptimisticPath] = useState(null);
  const [secondPreview, setSecondPreview] = useState(null);

  const viewportRef = useRef(null);
  const currentRef = useRef(null);
  const previousRef = useRef(null);
  const nextRef = useRef(null);
  const secondRef = useRef(null);
  const frameRef = useRef(null);
  const settleTimerRef = useRef(null);
  const navigationTimerRef = useRef(null);
  const gestureRef = useRef(freshGesture());
  const navigationRef = useRef(null);

  const cancelTimers = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    if (navigationTimerRef.current !== null) clearTimeout(navigationTimerRef.current);
    frameRef.current = null;
    settleTimerRef.current = null;
    navigationTimerRef.current = null;
  }, []);

  const setIdlePanels = useCallback(() => {
    const width = viewportRef.current?.clientWidth || window.innerWidth || 360;
    movePanel(currentRef, 0);
    movePanel(previousRef, -width);
    movePanel(nextRef, width);
  }, []);

  // Satu jalur animasi untuk swipe biasa dan swipe kedua yang sempat antre.
  const snapToTab = useCallback((target, direction, width, traveled = 0) => {
    navigationRef.current = target;
    setOptimisticPath(target);
    const farther = direction > 0 ? getPreviousTab(target) : getNextTab(target);
    setSecondPreview(farther ? { path: farther, direction } : null);

    const duration = getSwipeSnapDuration(width - Math.abs(traveled), width);
    const grace = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ROUTE_COMMIT_GRACE_MS;
    const easing = `transform ${duration}ms ${SNAP_EASING}`;
    movePanel(currentRef, direction < 0 ? -width : width, easing);
    movePanel(previousRef, direction > 0 ? 0 : -width, easing);
    movePanel(nextRef, direction < 0 ? 0 : width, easing);

    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      router.push(target);
      navigationTimerRef.current = setTimeout(() => {
        // Lepaskan pengunci jika rute gagal dimuat.
        navigationTimerRef.current = null;
        navigationRef.current = null;
        setOptimisticPath(null);
        setIdlePanels();
      }, 6000);
    }, duration + grace);
  }, [router, setIdlePanels]);

  // Kedua tetangga sudah siap sebelum swipe pertama, serta rute statis diprefetch.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile || currentPath === '/login') return;
    for (const path of [prevPath, nextPath]) {
      if (path) router.prefetch(path);
    }
  }, [isMobile, currentPath, prevPath, nextPath, router]);

  // Perubahan rute (termasuk lewat klik menu) membatalkan gesture yang lama.
  useEffect(() => {
    const keepDragging = gestureRef.current.active &&
      gestureRef.current.queued && gestureRef.current.basePath === currentPath;
    cancelTimers();
    navigationRef.current = null;
    if (!keepDragging) gestureRef.current = freshGesture();
    setOptimisticPath(null);
    setSecondPreview(null);
    if (isMobile) setIdlePanels();
  }, [currentPath, isMobile, cancelTimers, setIdlePanels]);

  // Static GitHub Pages dapat melakukan full-document navigation. Simpan hanya
  // pasangan rute (bukan data pengguna) agar swipe kedua tidak hilang saat reload.
  useEffect(() => {
    if (!isMobile) return;
    let stored;
    try { stored = sessionStorage.getItem(SWIPE_CONTINUATION_KEY); } catch (_) { return; }
    if (!stored) return;
    const clearContinuation = () => {
      try { sessionStorage.removeItem(SWIPE_CONTINUATION_KEY); } catch (_) {}
    };
    let continuation;
    try { continuation = JSON.parse(stored); } catch (_) {
      clearContinuation();
      return;
    }
    const valid = continuation.expires > Date.now() && (
      getNextTab(continuation.from) === continuation.to ||
      getPreviousTab(continuation.from) === continuation.to
    );
    if (!valid || currentPath === continuation.to) {
      clearContinuation();
      return;
    }
    if (currentPath === continuation.from) {
      clearContinuation();
      router.replace(continuation.to);
    }
  }, [currentPath, isMobile, router]);

  useEffect(() => () => cancelTimers(), [cancelTimers]);

  // Header dan bottom navigation harus menunjukkan tab tujuan yang sama.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('kayla:swipe-route', { detail: optimisticPath }));
  }, [optimisticPath]);

  const paintDrag = useCallback(() => {
    const g = gestureRef.current;
    if (!g.horizontal || !g.active) return;
    const dx = Math.max(-g.width, Math.min(g.width, g.x - g.startX));

    if (g.queued && g.basePath !== currentPath) {
      const direction = g.basePath === prevPath ? 1 : g.basePath === nextPath ? -1 : 0;
      if (!direction || !g.pausedFirst) return;
      const firstPanel = direction > 0 ? previousRef : nextRef;
      // Setelah swipe pertama, halaman pratinjau pertama menjadi panel pusat.
      // Saat jari kedua bergerak, panel kedua juga mengikuti jari 1:1.
      movePanel(firstPanel, dx);
      if (Math.sign(dx) === direction && secondRef.current) {
        movePanel(secondRef, -direction * g.width + dx);
        movePanel(currentRef, direction * g.width);
      } else {
        movePanel(currentRef, direction * g.width + dx);
        movePanel(secondRef, -direction * g.width);
      }
      return;
    }

    const adjacent = dx < 0 ? nextPath : dx > 0 ? prevPath : null;
    g.target = adjacent;

    if (!adjacent) {
      // Perlawanan lembut ketika berada pada tab pertama/terakhir.
      const elastic = Math.sign(dx) * Math.min(24, Math.sqrt(Math.abs(dx)) * 2.1);
      movePanel(currentRef, elastic);
      movePanel(previousRef, -g.width);
      movePanel(nextRef, g.width);
      return;
    }

    movePanel(currentRef, dx);
    movePanel(previousRef, dx > 0 ? -g.width + dx : -g.width);
    movePanel(nextRef, dx < 0 ? g.width + dx : g.width);
  }, [prevPath, nextPath, currentPath]);

  const springBack = useCallback(() => {
    const g = gestureRef.current;
    const duration = getSwipeSnapDuration(Math.abs(g.x - g.startX), g.width, true);
    const easing = `transform ${duration}ms ${SNAP_EASING}`;
    movePanel(currentRef, 0, easing);
    movePanel(previousRef, -g.width, easing);
    movePanel(nextRef, g.width, easing);

    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setIdlePanels();
    }, duration + 30);
  }, [setIdlePanels]);

  const resumeFirstNavigation = useCallback((gesture) => {
    if (gesture.queued && gesture.pausedFirst && navigationRef.current === gesture.basePath) {
      const direction = gesture.basePath === prevPath ? 1 : -1;
      const duration = getSwipeSnapDuration(Math.abs(gesture.x - gesture.startX), gesture.width, true);
      const easing = `transform ${duration}ms ${SNAP_EASING}`;
      movePanel(direction > 0 ? previousRef : nextRef, 0, easing);
      movePanel(currentRef, direction * gesture.width, easing);
      movePanel(secondRef, -direction * gesture.width, easing);
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        router.push(gesture.basePath);
      }, duration);
    }
  }, [prevPath, router]);

  const handlePointerDown = useCallback((event) => {
    if (!isMobile || gestureRef.current.active) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;

    const width = viewportRef.current?.clientWidth || window.innerWidth;
    if (event.pointerType === 'touch' &&
        (event.clientX < EDGE_ZONE || event.clientX > width - EDGE_ZONE)) return;

    const pendingRoute = navigationRef.current;
    // Jari kedua tetap direkam meski animasi pertama sedang settle. Jangan
    // pindah dokumen saat jari kedua masih turun, agar pointerup tidak hilang.
    const pausedFirst = Boolean(pendingRoute && settleTimerRef.current !== null);
    if (pausedFirst) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
      const direction = pendingRoute === prevPath ? 1 : -1;
      movePanel(direction > 0 ? previousRef : nextRef, 0);
      movePanel(currentRef, direction * width);
      movePanel(secondRef, -direction * width);
    }
    if (!pendingRoute) {
      cancelTimers();
      setIdlePanels();
    }
    gestureRef.current = {
      ...freshGesture(),
      queued: Boolean(pendingRoute),
      basePath: pendingRoute || currentPath,
      pausedFirst,
      active: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      width,
    };
  }, [isMobile, currentPath, prevPath, cancelTimers, setIdlePanels]);

  const handlePointerMove = useCallback((event) => {
    const g = gestureRef.current;
    if (!g.active || event.pointerId !== g.pointerId) return;
    if (g.pointerType === 'mouse' && !(event.buttons & 1)) {
      g.active = false;
      if (g.queued && g.basePath !== currentPath) resumeFirstNavigation(g);
      else springBack();
      return;
    }

    g.x = event.clientX;
    g.y = event.clientY;
    const dx = g.x - g.startX;
    const dy = g.y - g.startY;

    if (!g.classified) {
      if (Math.hypot(dx, dy) < TOUCH_SLOP) return;
      g.classified = true;
      if (Math.abs(dx) <= Math.abs(dy) * 1.25) {
        g.active = false; // Scroll vertikal tetap native.
        resumeFirstNavigation(g);
        return;
      }
      g.horizontal = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    }

    const dt = event.timeStamp - g.lastTime;
    if (dt > 0 && dt < 100) {
      g.velocityX = (g.x - g.lastX) / dt;
    }
    g.lastX = g.x;
    g.lastTime = event.timeStamp;

    // Tidak ada setState ataupun mount komponen saat jari bergerak.
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        paintDrag();
      });
    }
  }, [currentPath, paintDrag, resumeFirstNavigation, springBack]);

  const handlePointerUp = useCallback((event) => {
    const g = gestureRef.current;
    if (!g.active || event.pointerId !== g.pointerId) return;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    // Pakai koordinat pointer terakhir sebelum memulai snap, tanpa frame tertinggal.
    if (g.horizontal) paintDrag();
    g.active = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch (_) {}

    if (!g.horizontal) {
      if (g.queued && g.basePath !== currentPath) resumeFirstNavigation(g);
      return;
    }

    const deltaX = g.x - g.startX;
    const target = deltaX < 0 ? getNextTab(g.basePath) : deltaX > 0 ? getPreviousTab(g.basePath) : null;
    const confirm = target && getSwipeDecision({
      deltaX,
      deltaY: g.y - g.startY,
      width: g.width,
      velocityX: g.velocityX,
      lastMoveAge: Math.max(0, event.timeStamp - g.lastTime),
    });

    if (!confirm) {
      if (g.queued && g.basePath !== currentPath) resumeFirstNavigation(g);
      else springBack();
      return;
    }

    if (g.queued && g.basePath !== currentPath) {
      const direction = g.basePath === prevPath ? 1 : -1;
      if (g.pausedFirst && target === currentPath) {
        // Swipe kedua berbalik ke rute awal, jadi batalkan navigasi pertama.
        navigationRef.current = null;
        setOptimisticPath(null);
        setSecondPreview(null);
        springBack();
        return;
      }

      if (g.pausedFirst && Math.sign(deltaX) === direction && secondRef.current) {
        const duration = getSwipeSnapDuration(g.width - Math.abs(deltaX), g.width);
        const easing = `transform ${duration}ms ${SNAP_EASING}`;
        movePanel(direction > 0 ? previousRef : nextRef, direction * g.width, easing);
        movePanel(secondRef, 0, easing);
        navigationRef.current = target;
        setOptimisticPath(target);
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          router.push(target);
        }, duration);
        return;
      }

      // Swipe kedua sudah pasti valid. Lewati rute perantara yang belum selesai
      // agar tidak terbuang oleh navigasi / hydration yang berlangsung.
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      try {
        sessionStorage.setItem(SWIPE_CONTINUATION_KEY, JSON.stringify({
          from: g.basePath, to: target, expires: Date.now() + 8000,
        }));
      } catch (_) {}
      navigationRef.current = target;
      setOptimisticPath(target);
      router.push(target);
      return;
    }

    snapToTab(target, Math.sign(deltaX), g.width, deltaX);
  }, [currentPath, prevPath, paintDrag, resumeFirstNavigation, router, snapToTab, springBack]);

  const handlePointerCancel = useCallback((event) => {
    const g = gestureRef.current;
    if (!g.active || event.pointerId !== g.pointerId) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    g.active = false;
    if (g.queued && g.basePath !== currentPath) resumeFirstNavigation(g);
    else springBack();
  }, [currentPath, resumeFirstNavigation, springBack]);

  if (currentPath === '/login' || pathname?.includes('/login')) {
    return <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen">{children}</div>;
  }

  if (!isMobile) {
    return (
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen">
        <Header />
        <div className="flex-1 flex flex-col min-w-0 w-full">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen relative">
      <Header routeOverride={optimisticPath} />
      <div
        data-swipe-viewport
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="flex-1 flex flex-col min-w-0 w-full relative overflow-x-hidden touch-pan-y"
        style={{ touchAction: 'pan-y pinch-zoom', overscrollBehaviorX: 'contain' }}
      >
        <div data-swipe-current ref={currentRef} className="flex-1 flex flex-col min-w-0 w-full relative z-10" style={{ willChange: 'transform' }}>
          {children}
        </div>
        {prevPath && (
          <div
            data-swipe-previous
            ref={previousRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full z-20 overflow-hidden pointer-events-none select-none bg-slate-50"
            style={{ transform: 'translate3d(-100%, 0, 0)', willChange: 'transform' }}
          >
            <TabPreview path={prevPath} />
          </div>
        )}
        {nextPath && (
          <div
            data-swipe-next
            ref={nextRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full z-20 overflow-hidden pointer-events-none select-none bg-slate-50"
            style={{ transform: 'translate3d(100%, 0, 0)', willChange: 'transform' }}
          >
            <TabPreview path={nextPath} />
          </div>
        )}
        {secondPreview && (
          <div
            data-swipe-second
            ref={secondRef}
            aria-hidden="true"
            className="absolute inset-0 w-full h-full z-20 overflow-hidden pointer-events-none select-none bg-slate-50"
            style={{ transform: secondPreview.direction > 0 ? 'translate3d(-100%, 0, 0)' : 'translate3d(100%, 0, 0)', willChange: 'transform' }}
          >
            <TabPreview path={secondPreview.path} />
          </div>
        )}
      </div>
    </div>
  );
}
