'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import styles from './balance-card-3d.module.css';

/**
 * @typedef {Object} BalanceCard3DWrapperProps
 * @property {React.ReactNode} children Konten kartu saldo yang dibungkus
 * @property {number} [maxTiltDeg=4.5] Sudut kemiringan maksimum dalam derajat (default: 4.5 agar tetap minimalis)
 * @property {boolean} [disabled=false] Nonaktifkan efek 3D secara manual jika diperlukan
 * @property {string} [className=''] Kelas CSS tambahan untuk kontainer
 * @property {string} [borderRadius='0.75rem'] Border radius mengikuti kartu asli (default: '0.75rem' untuk rounded-xl)
 */

/**
 * Komponen wrapper kartu 3D yang ringan dan elegan untuk Dashboard Kayla Finance.
 * Menggunakan akselerasi perangkat keras CSS 3D, specular glare, dan rim-light tipis.
 * @param {BalanceCard3DWrapperProps} props
 * @returns {React.ReactElement}
 */
export function BalanceCard3DWrapper({
  children,
  maxTiltDeg = 4.5,
  disabled = false,
  className = '',
  borderRadius = '0.75rem',
}) {
  const surfaceRef = useRef(null);
  const rafIdRef = useRef(null);
  const canTiltRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || disabled) {
      canTiltRef.current = false;
      return;
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    const updateCapability = () => {
      canTiltRef.current = !reducedMotionQuery.matches && finePointerQuery.matches;
      if (!canTiltRef.current && surfaceRef.current) {
        surfaceRef.current.dataset.active = 'false';
        surfaceRef.current.style.setProperty('--rx', '0deg');
        surfaceRef.current.style.setProperty('--ry', '0deg');
        surfaceRef.current.style.setProperty('--glare-opacity', '0');
      }
    };

    updateCapability();

    reducedMotionQuery.addEventListener('change', updateCapability);
    finePointerQuery.addEventListener('change', updateCapability);

    return () => {
      reducedMotionQuery.removeEventListener('change', updateCapability);
      finePointerQuery.removeEventListener('change', updateCapability);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [disabled]);

  const handlePointerMove = useCallback(
    (event) => {
      if (!canTiltRef.current || !surfaceRef.current) return;

      const element = surfaceRef.current;
      const clientX = event.clientX;
      const clientY = event.clientY;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Normalisasi posisi pointer ke rentang [-0.5, 0.5]
        const normX = (clientX - rect.left) / rect.width - 0.5;
        const normY = (clientY - rect.top) / rect.height - 0.5;

        // Hitung sudut rotasi halus (dibatasi oleh maxTiltDeg)
        const rotateY = +(normX * maxTiltDeg * 2).toFixed(2);
        const rotateX = +(-normY * maxTiltDeg * 2).toFixed(2);

        // Posisi highlight spekular dalam persentase
        const glareX = +(((normX + 0.5) * 100)).toFixed(1);
        const glareY = +(((normY + 0.5) * 100)).toFixed(1);

        element.dataset.active = 'true';
        element.style.setProperty('--rx', `${rotateX}deg`);
        element.style.setProperty('--ry', `${rotateY}deg`);
        element.style.setProperty('--glare-x', `${glareX}%`);
        element.style.setProperty('--glare-y', `${glareY}%`);
        element.style.setProperty('--glare-opacity', '1');
      });
    },
    [maxTiltDeg]
  );

  const handlePointerLeave = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    const element = surfaceRef.current;
    if (!element) return;

    element.dataset.active = 'false';
    element.style.setProperty('--rx', '0deg');
    element.style.setProperty('--ry', '0deg');
    element.style.setProperty('--glare-opacity', '0');
  }, []);

  return (
    <div className={`${styles.perspectiveContainer} ${className}`.trim()}>
      <div
        ref={surfaceRef}
        className={styles.card3dSurface}
        style={{ borderRadius }}
        data-active="false"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
      >
        <div className={styles.glareLayer} aria-hidden="true" />
        <div className={styles.edgeBevel} aria-hidden="true" />
        <div className={styles.contentLayer}>{children}</div>
      </div>
    </div>
  );
}

export default BalanceCard3DWrapper;
