---
name: client-auth
description: Better Auth client setup, useSession hook, protected routes, and auth forms using TanStack Form + useMutation. Use when building sign-in/sign-up forms, protecting routes, or accessing session in user-application.
---

# Client Auth (Better Auth)

## Auth Client Setup

```ts
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({ baseURL: '/api/auth' })
export const { useSession, signIn, signOut } = authClient
```

## Session Hook

```tsx
const { data: session, isPending } = useSession()
if (isPending) return <Spinner />
if (!session) return <SignInButton />
return <div>{session.user.name}<button onClick={() => signOut()}>Sign Out</button></div>
```

## Protected Routes (TanStack Router middleware)

```ts
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const session = await getSession()
  if (!session) throw redirect({ to: '/login' })
  return next({ context: { session } })
})
```

## Auth Forms (REQUIRED: TanStack Form + useMutation)

Never use raw `useState`. Always `useForm` + `useMutation`:

```tsx
const mutation = useMutation({
  mutationFn: async (data: { email: string; password: string }) => {
    const result = await authClient.signIn.email(data)
    if (result.error) throw new Error(result.error.message)
    return result
  },
})

const form = useForm({
  defaultValues: { email: '', password: '' },
  onSubmit: async ({ value }) => {
    mutation.reset()
    await mutation.mutateAsync(value)
    navigate({ to: '/dashboard' })
  },
})
```

## Server Functions with Auth

```ts
export const getSecureData = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return fetchDataForUser(context.session.user.id)
  })
```

## Security

- Never expose tokens in client code
- Redirect to `/login` on 401: `if (response.status === 401) window.location.href = '/login'`
