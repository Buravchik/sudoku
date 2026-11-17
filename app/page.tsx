"use client";

import dynamic from "next/dynamic";

const GameApp = dynamic(() => import("@/components/GameApp"), {
  ssr: false,
  loading: () => <div className="loading">Loading...</div>,
});

export default function Home() {
  return <GameApp />;
}
