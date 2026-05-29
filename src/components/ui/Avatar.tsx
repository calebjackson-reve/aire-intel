"use client";

import { CSSProperties } from "react";

interface AvatarProps {
  name: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Deterministic color from name — always the same for the same person
function getGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #EE8172 0%, #EFDD84 100%)",  // coral → cream
    "linear-gradient(135deg, #728AC5 0%, #6EE7B7 100%)",  // blue → mint
    "linear-gradient(135deg, #EE8172 0%, #728AC5 100%)",  // coral → blue
    "linear-gradient(135deg, #EFDD84 0%, #6EE7B7 100%)",  // cream → mint
    "linear-gradient(135deg, #728AC5 0%, #EE8172 100%)",  // blue → coral
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

export function Avatar({ name, size = 32, style, className }: AvatarProps) {
  return (
    <div
      className={className}
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: getGradient(name),
        color: "#09090B",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(9, Math.floor(size * 0.34)),
        flexShrink: 0,
        letterSpacing: "-0.01em",
        userSelect: "none",
        ...style,
      }}
    >
      {getInitials(name)}
    </div>
  );
}
