"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email")),
      password: String(form.get("password")),
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-retro)] border-2 border-border bg-white shadow-hard">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/android-chrome-192-192.png"
              alt="Retroz"
              className="size-full object-cover"
            />
          </div>
          <div>
            <p className="font-display text-2xl font-bold leading-none">
              Retroz
            </p>
            <p className="text-xs text-fg-muted">Your productivity assistant</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="retro-card scanlines p-6 flex flex-col gap-4"
        >
          <div>
            <h1 className="font-display text-xl font-bold">Welcome back</h1>
            <p className="text-sm text-fg-muted">Sign in to your workspace.</p>
          </div>

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <p className="text-sm font-medium text-danger">{error}</p>
          ) : null}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              "Enter"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
