"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 font-sans">
        <h1 className="text-lg font-semibold text-ink-900">
          Something went wrong
        </h1>
        <p className="max-w-md text-center text-sm text-ink-500">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="btn btn-primary"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
