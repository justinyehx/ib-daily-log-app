"use client";

import { signInDemo } from "@/lib/server/auth-actions";

type LoginFormProps = {
  stores: { slug: string; name: string; stylists: string[] }[];
};

export function LoginForm({ stores: _ }: LoginFormProps) {
  return (
    <form action={signInDemo} className="settings-form">
      <label className="settings-field">
        Email
        <input name="email" placeholder="name@example.com" required type="email" />
      </label>

      <label className="settings-field">
        Password
        <input name="password" placeholder="Password" required type="password" />
      </label>

      <div className="settings-actions">
        <button className="button" type="submit">
          Sign in
        </button>
      </div>
    </form>
  );
}
