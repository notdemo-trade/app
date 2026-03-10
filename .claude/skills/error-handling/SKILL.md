---
name: error-handling
description: Result<T> and AppError patterns for backend services and frontend mutation error display. Use when writing services, handlers, or displaying API errors in the UI.
---

# Error Handling

## Backend: Result<T> Pattern

Services return `Result<T>`, never throw. Handlers unwrap via `resultToResponse()`.

```ts
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

## AppError

```ts
new AppError(message, statusCode, code?)
// code is machine-readable: 'NOT_FOUND', 'VALIDATION_FAILED', 'DUPLICATE'
```

Global `onErrorHandler` catches unhandled errors — services should use `Result<T>` instead.

## Frontend: Mutation Errors

```ts
import { AppError } from '@/core/errors';
// thrown by api-client on non-2xx responses
```

```tsx
{mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}
```

## Rules

- Never catch silently — always surface errors to the user
- Use error boundaries for unexpected crashes
- Use `mutation.error` for expected API failures
