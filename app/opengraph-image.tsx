import { ImageResponse } from "next/og";

export const alt = "PitchCue · 評審 Q&A 即時提詞助手";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 配色沿用 globals.css 的 ground / ink / marker
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f2f2ef",
          color: "#17181a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "#d5271f",
            }}
          />
          <div style={{ fontSize: 36, color: "#5b5f66", letterSpacing: 2 }}>REC</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex" }}>
            <span
              style={{
                fontSize: 152,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: -6,
                background: "#ffe45c",
                padding: "8px 28px",
              }}
            >
              PitchCue
            </span>
          </div>
          <div style={{ fontSize: 52, fontWeight: 500 }}>評審 Q&A 即時提詞助手</div>
          <div style={{ fontSize: 30, color: "#5b5f66" }}>
            錄下評審的問題 → 語音轉文字 → 立刻給你可直接唸的口語稿
          </div>
        </div>
      </div>
    ),
    size,
  );
}
