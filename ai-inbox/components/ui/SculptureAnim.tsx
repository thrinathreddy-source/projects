"use client";
import React from "react";

type SvgProps = { className?: string; style?: React.CSSProperties };

export function ApsaraDancer({ className = "", style }: SvgProps) {
  const merged: React.CSSProperties = { animation: "apsara-sway 4s ease-in-out infinite", ...style };
  return (
    <svg viewBox="0 0 120 260" className={className} style={merged}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="60" cy="22" rx="13" ry="15" />
      <path d="M47 12 Q50 2 60 5 Q70 2 73 12" />
      <path d="M52 8 Q60 0 68 8" />
      <line x1="60" y1="37" x2="60" y2="46" />
      <path d="M30 54 Q45 46 60 46 Q75 46 88 54" />
      <path d="M60 46 Q66 60 62 74" />
      <path d="M62 74 Q55 88 58 104" />
      <path d="M40 98 Q58 104 76 100" />
      <path d="M88 54 Q100 44 106 30 Q108 24 104 20" />
      <path d="M104 20 Q110 16 108 12" />
      <circle cx="108" cy="11" r="3" />
      <path d="M105 8 Q108 5 111 8" />
      <path d="M106 14 Q108 17 110 14" />
      <path d="M30 54 Q18 62 14 76 Q12 82 16 86" />
      <path d="M16 86 Q14 90 18 92" />
      <path d="M18 92 Q16 96 20 97" />
      <path d="M76 100 Q80 120 76 140 Q74 152 78 162" />
      <path d="M40 98 Q38 118 40 140 Q42 158 40 172" />
      <path d="M78 162 Q82 168 86 165 Q88 162 84 158" />
      <path d="M40 172 Q36 178 32 175 Q30 172 34 168" />
      <path d="M42 100 Q60 108 78 100" strokeDasharray="3,2" />
      <path d="M44 104 Q50 130 46 155 Q44 165 42 172" />
      <path d="M74 102 Q78 128 76 152 Q76 162 78 168" />
      <path d="M30 54 Q20 80 24 110 Q26 124 20 140" strokeDasharray="4,3" />
      <path d="M36 168 Q40 170 44 168" />
      <path d="M74 160 Q78 162 82 160" />
      <path d="M48 48 Q60 54 72 48" strokeDasharray="2,2" />
      <ellipse cx="106" cy="28" rx="3" ry="2" />
      <ellipse cx="15" cy="80" rx="2" ry="3" />
    </svg>
  );
}

export function LoveCouple({ className = "", style }: SvgProps) {
  const merged: React.CSSProperties = { animation: "couple-float 5s ease-in-out infinite", ...style };
  return (
    <svg viewBox="0 0 160 200" className={className} style={merged}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Figure 1 */}
      <ellipse cx="50" cy="28" rx="11" ry="13" />
      <path d="M40 20 Q50 12 60 20" />
      <line x1="50" y1="41" x2="50" y2="50" />
      <path d="M28 58 Q40 50 50 50 Q60 50 68 56" />
      <path d="M50 50 Q54 68 52 86" />
      <path d="M52 86 Q56 100 54 114" />
      <path d="M68 56 Q82 52 90 62" />
      <path d="M28 58 Q18 66 16 80" />
      <path d="M46 110 Q42 130 44 148" />
      <path d="M58 112 Q62 132 60 150" />
      {/* Figure 2 */}
      <ellipse cx="112" cy="30" rx="11" ry="13" />
      <path d="M102 22 Q112 14 122 22" />
      <line x1="112" y1="43" x2="112" y2="52" />
      <path d="M90 62 Q100 52 112 52 Q122 52 132 58" />
      <path d="M112 52 Q108 70 110 88" />
      <path d="M110 88 Q106 102 108 116" />
      <path d="M90 62 Q80 56 72 64" />
      <path d="M132 58 Q142 66 144 80" />
      <path d="M104 112 Q100 132 102 150" />
      <path d="M116 114 Q120 134 118 152" />
      {/* Lotus between */}
      <path d="M78 70 Q82 62 86 70" />
      <path d="M76 72 Q82 66 88 72" />
      <circle cx="82" cy="72" r="3" />
      {/* Flowing scarves */}
      <path d="M18 80 Q14 100 18 120 Q20 132 16 144" strokeDasharray="4,3" />
      <path d="M142 80 Q146 100 142 120 Q140 132 144 144" strokeDasharray="4,3" />
      {/* Ground lotuses */}
      <path d="M30 158 Q42 152 50 158 Q58 164 50 168 Q42 164 30 158" />
      <path d="M108 160 Q118 154 128 160 Q136 166 128 170 Q118 166 108 160" />
    </svg>
  );
}

export function LotusBlossom({ className = "", style }: SvgProps) {
  const merged: React.CSSProperties = { animation: "lotus-bloom 6s ease-in-out infinite", ...style };
  return (
    <svg viewBox="0 0 100 100" className={className} style={merged}
      fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="50" r="8" />
      <path d="M50 42 Q44 36 50 30 Q56 36 50 42" />
      <path d="M58 44 Q66 40 70 34 Q64 42 58 44" />
      <path d="M62 52 Q70 50 76 44 Q68 50 62 52" />
      <path d="M58 60 Q64 66 70 68 Q64 60 58 60" />
      <path d="M50 62 Q50 70 50 76 Q44 70 50 62" />
      <path d="M42 60 Q36 66 30 68 Q36 60 42 60" />
      <path d="M38 52 Q30 50 24 44 Q32 50 38 52" />
      <path d="M42 44 Q34 40 30 34 Q36 42 42 44" />
      <path d="M50 38 Q42 28 50 18 Q58 28 50 38" />
      <path d="M62 42 Q72 34 82 38 Q72 46 62 42" />
      <path d="M66 54 Q78 54 84 62 Q74 62 66 54" />
      <path d="M62 66 Q70 76 66 86 Q58 78 62 66" />
      <path d="M50 70 Q50 82 42 88 Q42 78 50 70" />
      <path d="M38 66 Q30 76 34 86 Q42 78 38 66" />
      <path d="M34 54 Q22 54 16 62 Q26 62 34 54" />
      <path d="M38 42 Q28 34 18 38 Q28 46 38 42" />
      <path d="M50 76 Q48 88 50 95" />
      <path d="M44 90 Q50 95 56 90" />
    </svg>
  );
}
