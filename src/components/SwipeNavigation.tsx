'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MAIN_TABS = ['/', '/accounts', '/transactions', '/trading', '/reports'];

interface SwipeNavigationProps {
  children: React.ReactNode;
}

export default function SwipeNavigation({ children }: SwipeNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();

  const prevPathRef = useRef<string>(pathname);
  const [slideDirection, setSlideDirection] = useState<'right' | 'left' | 'none'>('none');

  // Touch tracking
  const touchStartRef = useRef<{ x: number; y: number; time: number; valid: boolean }>({
    x: 0,
    y: 0,
    time: 0,
    valid: false,
  });
  const isNavigatingRef = useRef(false);

  // Update animation direction when pathname changes
  useEffect(() => {
    const prev = prevPathRef.current;
    const current = pathname;

    const prevIndex = MAIN_TABS.indexOf(prev);
    const currentIndex = MAIN_TABS.indexOf(current);

    if (prevIndex !== -1 && currentIndex !== -1 && prevIndex !== currentIndex) {
      if (currentIndex > prevIndex) {
        setSlideDirection('right'); // Berpindah ke tab kanan (konten meluncur dari kanan)
      } else {
        setSlideDirection('left'); // Berpindah ke tab kiri (konten meluncur dari kiri)
      }
    } else {
      setSlideDirection('none');
    }

    prevPathRef.current = current;
    isNavigatingRef.current = false;
  }, [pathname]);

  // Touch Start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || isNavigatingRef.current) return;

    const touch = e.touches[0];
    const target = e.target as HTMLElement | null;

    // Abaikan jika sentuhan terjadi di dalam modal, formulir, grafik, listbox, atau tabel scroll horizontal
    if (target) {
      const isInteractive = target.closest(
        'input, textarea, select, button, [role="dialog"], [role="slider"], [role="listbox"], [role="option"], .recharts-wrapper, svg, .overflow-x-auto, table'
      );
      if (isInteractive) {
        touchStartRef.current.valid = false;
        return;
      }
    }

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      valid: true,
    };
  }, []);

  // Touch End
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current.valid || isNavigatingRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;

      touchStartRef.current.valid = false;

      // Syarat gestur geser horizontal:
      // 1. Jarak geser horizontal minimal 65px
      // 2. Arah geser dominan horizontal (minimal 1.6x lebih besar dibanding vertikal)
      // 3. Durasi geser cepat (kurang dari 600ms)
      if (
        Math.abs(deltaX) > 65 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.6 &&
        elapsed < 600
      ) {
        const currentIndex = MAIN_TABS.indexOf(pathname);
        if (currentIndex === -1) return;

        if (deltaX < 0) {
          // Geser ke kiri (jari dari kanan ke kiri) -> Buka tab berikutnya di kanan
          if (currentIndex < MAIN_TABS.length - 1) {
            isNavigatingRef.current = true;
            const nextRoute = MAIN_TABS[currentIndex + 1];
            router.push(nextRoute);
            setTimeout(() => {
              isNavigatingRef.current = false;
            }, 750);
          }
        } else {
          // Geser ke kanan (jari dari kiri ke kanan) -> Buka tab sebelumnya di kiri
          if (currentIndex > 0) {
            isNavigatingRef.current = true;
            const prevRoute = MAIN_TABS[currentIndex - 1];
            router.push(prevRoute);
            setTimeout(() => {
              isNavigatingRef.current = false;
            }, 750);
          }
        }
      }
    },
    [pathname, router]
  );

  const handleTouchCancel = useCallback(() => {
    touchStartRef.current.valid = false;
    isNavigatingRef.current = false;
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="flex-1 flex flex-col min-w-0"
    >
      <div
        key={pathname}
        className={`flex-1 flex flex-col min-w-0 ${
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
