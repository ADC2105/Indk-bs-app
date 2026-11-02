"use client";

import { useActionState } from "react";
import { login } from "./actions";

type LoginState = { error: string } | null;

async function loginAction(_prevState: LoginState, formData: FormData) {
  const result = await login(formData);
  return result ?? null;
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
          Madplan
        </h1>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Adgangskode
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-lg bg-green-600 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {pending ? "Logger ind…" : "Log ind"}
          </button>
        </form>
      </div>
    </main>
  );
}
