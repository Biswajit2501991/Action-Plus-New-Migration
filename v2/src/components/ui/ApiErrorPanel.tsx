import { ApiError } from '@/api/client';

export function ApiErrorPanel({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong loading data.';

  const is502 = error instanceof ApiError && error.status >= 500;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-rose-800">
        {is502 ? 'Backend unavailable' : 'Could not load data'}
      </p>
      <p className="mt-2 text-sm text-rose-700">{message}</p>
      <p className="mt-3 text-xs text-rose-600">
        Ensure the Express API is running on port 4000 and you are signed in.
      </p>
    </div>
  );
}
