---
name: better-auth
description: Better Auth server-side configuration, Drizzle integration, session management, and schema extension in packages/data-ops. Use when configuring auth, managing sessions, or extending the user schema.
---

# Better Auth (Server)

## Configuration

```ts
// config/auth.ts
export const auth = betterAuth({
  database: { ... },
  plugins: [ ... ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,       // refresh daily
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
})

export type Auth = typeof auth
```

- Never edit `auth-schema.ts` (auto-generated)
- Run `pnpm better-auth:generate` after config changes
- Migrations handled via Drizzle

## Extending the User Schema

```ts
user: {
  additionalFields: {
    role: {
      type: 'string',
      required: true,
      defaultValue: 'user',
      input: false, // server assigns, not user
    },
  },
}
```

## Security

- Never expose auth secrets in client code
- HTTP-only cookies for session tokens (default)
- Rate limit auth endpoints
- Revoke sessions on password change

## Client Integration

- Export auth client config for frontend
- Use typed client from `better-auth/react`
