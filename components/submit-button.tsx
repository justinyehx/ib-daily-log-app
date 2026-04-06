"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel?: string;
};

export function SubmitButton({
  children,
  className = "",
  disabled,
  pendingLabel,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      {...props}
      aria-busy={pending}
      className={`${className}${pending ? " is-pending" : ""}`}
      disabled={isDisabled}
      type={props.type ?? "submit"}
    >
      {pending ? pendingLabel || children : children}
    </button>
  );
}
