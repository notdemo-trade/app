---
paths:
  - "apps/data-service/**"
  - "apps/user-application/**"
---

# Error Handling Rules

## Backend (data-service)

### Result<T> Pattern

Services return `Result<T>`, never throw. Handlers unwrap via `resultToResponse()`.

```ts
// types/result.ts
type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

// service
async function getUser(id: string): Promise<Result<User>> {
  const user = await getUserById(id);
  if (!user) return err(new AppError('User not found', 404, 'NOT_FOUND'));
  return ok(user);
}

// handler
app.get('/users/:id', async (c) => {
  const result = await getUser(c.req.param('id'));
  return resultToResponse(c, result);
});
```

### AppError Class

```ts
new AppError(message, statusCode, code?)
// code is machine-readable: 'NOT_FOUND', 'VALIDATION_FAILED', 'DUPLICATE'
```

### Error Middleware

Global `onErrorHandler` catches unhandled errors. Services should use Result<T> instead.

## Frontend (user-application)

### AppError (client)

```ts
import { AppError } from '@/core/errors';
// thrown by api-client on non-2xx responses
```

### Mutation Error Display

```tsx
{mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}
```

### Never Catch Silently

- Always surface errors to the user
- Use error boundaries for unexpected crashes
- Use mutation.error for expected API failures
