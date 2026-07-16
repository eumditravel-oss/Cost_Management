"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    logger.error("Unhandled application error", { digest: error.digest });
  }, [error]);

  return (
    <main>
      <h1>일시적인 오류가 발생했습니다.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
