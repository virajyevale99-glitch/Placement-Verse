'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field, Input, Select } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { loginSchema } from '@/lib/validation/schemas';

type Values = { username: string; password: string };

export function LoginForm({ expired, demoMode }: { expired: boolean; demoMode: boolean }) {
  const { register, handleSubmit, setError, formState } = useForm<Values>({ defaultValues: { username: 'viraj', password: '' } });
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (values: Values) => {
    setMessage(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setError('password', { message: 'Enter your password' });
      return;
    }
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.data) });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok) {
      window.location.assign('/admin');
      return;
    }
    setMessage(body?.error?.message ?? 'Sign-in failed. Please retry.');
  };

  return (
    <form className="mt-8 grid gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      {demoMode ? <Notice tone="info">Admin is turned off in local demo mode. Connect Google Apps Script first (docs/SETUP.md).</Notice> : null}
      {expired ? <Notice tone="info">Your session ended. Please sign in again.</Notice> : null}
      {message ? <Notice tone="error">{message}</Notice> : null}
      <Field id="username" label="Administrator">
        <Select {...register('username')} autoComplete="username">
          <option value="viraj">Viraj Yevale</option>
          <option value="uditi">Uditi</option>
        </Select>
      </Field>
      <Field id="password" label="Password" error={formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...register('password')} />
      </Field>
      <Button type="submit" size="lg" disabled={formState.isSubmitting || demoMode}>
        {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
