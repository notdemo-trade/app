---
name: tanstack
description: TanStack Start server functions, Router file-based routing, Query options/mutations, and Form patterns. Use when building routes, data fetching, mutations, or forms in apps/user-application.
---

# TanStack (Start + Router + Query + Form)

## Server Functions

```ts
export const getUser = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => getUserById(data.id))
```

## Route Definition

```tsx
export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params }) => getUser({ data: { id: params.userId } }),
  component: UserPage,
})

function UserPage() {
  const user = Route.useLoaderData()
  return <div>{user.name}</div>
}
```

## Query Options

```ts
export const userQueryOptions = (userId: string) =>
  queryOptions({ queryKey: ['users', userId], queryFn: () => fetchUser(userId) })

const { data } = useSuspenseQuery(userQueryOptions(userId))
```

## Mutations

- `mutate()` — fire-and-forget, use `onSuccess` for cache invalidation
- `mutateAsync()` — awaitable, use when navigating after submit

## Forms (REQUIRED — No raw useState)

```tsx
const mutation = useMutation({ mutationFn: createEntity, onSuccess: () => queryClient.invalidateQueries(...) })
const form = useForm({
  defaultValues: { name: '' },
  onSubmit: async ({ value }) => { mutation.reset(); mutation.mutate(value) },
})

<form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
  {mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}
  <form.Field name="name" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
    {(field) => <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}
  </form.Field>
  <form.Subscribe selector={(s) => s.canSubmit}>
    {(canSubmit) => <Button disabled={!canSubmit || mutation.isPending}>Save</Button>}
  </form.Subscribe>
</form>
```

## More Details

See [REFERENCE.md](REFERENCE.md) for: route file structure, query key factories, SSR patterns, navigation after submit.
