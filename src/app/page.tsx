"use client";

import dynamic from "next/dynamic";
import { Vignette } from "@/components/globe";

const Globe = dynamic(() => import("@/components/globe/Globe"), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#010108]">
      <Globe />
      <Vignette />
    </main>
  );
}
