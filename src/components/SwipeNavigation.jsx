'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { normalizePath, getNextTab, getPreviousTab } from '@/lib/navigation';
import TabPreview from '@/components/previews/TabPreview';
import { getSwipeDecision, getSwipeSnapDuration } from '@/lib/swipe-gesture';

const TOUCH_SLOP = 9;
const EDGE_ZONE = 18;
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

  const viewportRef = useRef(null);
  const currentRef = useRef(null);
  const previousRef = useRef(null);
  const nextRef = useRef(null);
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
    cancelTimers();
    navigationRef.current = null;
    gestureRef.current = freshGesture();
    setOptimisticPath(null);
    if (isMobile) setIdlePanels();
  }, [currentPath, isMobile, cancelTimers, setIdlePanels]);

  useEffect(() => () => cancelTimers(), [cancelTimers]);

  const paintDrag = useCallback(() => {
    const g = gestureRef.current;
    if (!g.horizontal || !g.active) return;
    const dx = Math.max(-g.width, Math.min(g.width, g.x - g.startX));
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
  }, [prevPath, nextPath]);

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

  const handlePointerDown = useCallback((event) => {
    if (!isMobile || navigationRef.current || gestureRef.current.active) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;

    const width = viewportRef.current?.clientWidth || window.innerWidth;
    if (event.pointerType === 'touch' &&
        (event.clientX < EDGE_ZONE || event.clientX > width - EDGE_ZONE)) return;

    cancelTimers();
    setIdlePanels();
    gestureRef.current = {
      ...freshGesture(),
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
  }, [isMobile, cancelTimers, setIdlePanels]);

  const handlePointerMove = useCallback((event) => {
    const g = gestureRef.current;
    if (!g.active || event.pointerId !== g.pointerId) return;
    if (g.pointerType === 'mouse' && !(event.buttons & 1)) {
      g.active = false;
      springBack();
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
  }, [paintDrag, springBack]);

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

    if (!g.horizontal) return;

    const deltaX = g.x - g.startX;
    const target = deltaX < 0 ? nextPath : prevPath;
    const confirm = target && getSwipeDecision({
      deltaX,
      deltaY: g.y - g.startY,
      width: g.width,
      velocityX: g.velocityX,
      lastMoveAge: Math.max(0, event.timeStamp - g.lastTime),
    });

    if (!confirm) {
      springBack();
      return;
    }

    navigationRef.current = target;
    setOptimisticPath(target); // Header ikut berganti pada gesture yang dikonfirmasi.

    const duration = getSwipeSnapDuration(g.width - Math.abs(deltaX), g.width);
    const easing = `transform ${duration}ms ${SNAP_EASING}`;
    movePanel(currentRef, deltaX < 0 ? -g.width : g.width, easing);
    movePanel(previousRef, deltaX > 0 ? 0 : -g.width, easing);
    movePanel(nextRef, deltaX < 0 ? 0 : g.width, easing);

    // Navigasi dimulai ketika animasi mendekati akhir. Panel preview tetap terlihat
    // sampai Next.js benar-benar mengganti rute, sehingga tidak ada kilatan kosong.
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      router.push(target);
      navigationTimerRef.current = setTimeout(() => {
        // Bila rute gagal dimuat, kembalikan UI dan izinkan mencoba lagi.
        navigationTimerRef.current = null;
        navigationRef.current = null;
        setOptimisticPath(null);
        setIdlePanels();
      }, 6000);
    }, duration);
  }, [nextPath, prevPath, paintDrag, router, setIdlePanels, springBack]);

  const handlePointerCancel = useCallback((event) => {
    const g = gestureRef.current;
    if (!g.active || event.pointerId !== g.pointerId) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    g.active = false;
    springBack();
  }, [springBack]);

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
      </div>
    </div>
  );
}
