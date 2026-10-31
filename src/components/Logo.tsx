'use client';

import React from 'react';

interface LogoIconProps {
  className?: string;
  size?: number;
}

/**
 * Twin Pillar K (Semi-luminescent) Icon
 * Desain logo ke-2 sesuai pilihan pengguna.
 */
export function LogoIcon({ className = '', size = 32 }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Left Pillar: Dark Slate Capsule */}
      <rect
        x="6"
        y="5.5"
        width="6"
        height="25"
        rx="3"
        className="fill-slate-900"
      />

      {/* Right Pillar: Emerald Chevron (Semi-luminescent K arm) */}
      <path
        d="M 27.5 7 L 16.5 18 L 28 29"
        fill="none"
        stroke="#059669"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  showSubtitle?: boolean;
  className?: string;
}

/**
 * Full Kayla Finance Brand Header (Logo Icon + Typography)
 */
export default function Logo({ size = 32, showSubtitle = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoIcon size={size} />
      <div className="flex flex-col justify-center">
        <div className="flex items-center text-sm sm:text-base font-bold tracking-tight leading-none">
          <span className="text-slate-900">Kayla</span>
          <span className="text-emerald-600 ml-1">Finance</span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium mt-0.5 tracking-tight">
            Personal & Trading System
          </span>
        )}
      </div>
    </div>
  );
}
