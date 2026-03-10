---
name: react
description: React 19 component structure, hooks, state management, and rendering patterns for this project. Use when creating React components in apps/user-application or following component conventions.
---

# React 19

## Component Structure

```tsx
interface UserCardProps {
  user: User
  onSelect?: (id: string) => void
}

export function UserCard({ user, onSelect }: UserCardProps) {
  return <div onClick={() => onSelect?.(user.id)}>{user.name}</div>
}
```

- Props interface above component
- Named exports only
- Keep components focused (single responsibility)

## Hooks

```tsx
export function useUser(id: string) {
  return useSuspenseQuery(userQueryOptions(id)).data
}
```

Custom hooks start with `use`. Extract complex logic — return stable references.

## Conditional Rendering

```tsx
// Early return for complex
if (error) return <ErrorState error={error} />
if (!data) return <EmptyState />
return <DataView data={data} />

// Ternary for simple
{isLoading ? <Spinner /> : <Content />}
```

## Lists — Always Stable Keys

```tsx
{users.map(user => <UserCard key={user.id} user={user} />)}
```

Prefer `id` over array index.

## Event Handlers

```tsx
// Simple — inline
<button onClick={() => setOpen(true)}>Open</button>

// Complex — extract with useCallback
const handleSubmit = useCallback(async () => {
  await mutation.mutateAsync(data)
  navigate({ to: '/success' })
}, [data, mutation, navigate])
```

## React 19 Features

```tsx
// Suspense boundaries
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

- Use Transitions for non-urgent updates
- Context for truly global state (theme, auth)
- Lift state only when needed
