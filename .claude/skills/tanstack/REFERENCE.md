# TanStack — Reference

## Route File Structure

```
routes/
├── __root.tsx           # Root layout
├── index.tsx            # /
├── _auth/               # Layout group (auth required)
│   ├── dashboard.tsx    # /dashboard
│   └── settings.tsx     # /settings
└── users/
    ├── index.tsx        # /users
    └── $userId.tsx      # /users/:userId
```

- `__root.tsx` for root layout
- `_layout/` prefix for layout routes (not in URL)
- `$param` for dynamic segments

## Query Key Factories

```ts
export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (filters: Filters) => [...queryKeys.users.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
  },
}
```

## Mutation Patterns

```ts
// mutate — stay on page, show result
const mutation = useMutation({
  mutationFn: createClient,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
})
form.onSubmit: mutation.mutate(value)

// mutateAsync — navigate after success
onSubmit: async ({ value }) => {
  const result = await mutation.mutateAsync(value)
  navigate({ to: '/dashboard' })
}
```

## Navigation After Submit

Use `mutateAsync` when you need to navigate:

```tsx
onSubmit: async ({ value }) => {
  mutation.reset()
  await mutation.mutateAsync(value)
  navigate({ to: '/dashboard' })
}
```

## SSR Patterns

- Use loaders for initial data (SSR-rendered)
- Hydrate query cache from loader data
- Prefer server functions over client fetch for SSR'd data

```tsx
export const Route = createFileRoute('/dashboard')({
  loader: () => queryClient.ensureQueryData(dashboardQueryOptions()),
  component: Dashboard,
})
```

## Form Field Error Display

```tsx
<form.Field name="email">
  {(field) => (
    <div>
      <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />
      {field.state.meta.errors.length > 0 && (
        <p className="text-destructive text-sm">{field.state.meta.errors[0]}</p>
      )}
    </div>
  )}
</form.Field>
```
