---
name: form-patterns
description: Standard form template using TanStack Form + TanStack Query mutation. Use when creating any form in user-application — enforces useForm + useMutation pattern, never raw useState.
---

# Form Patterns

## Required Stack: useForm + useMutation

Never use raw `useState` for form state.

## Standard Template

```tsx
function CreateEntityForm() {
  const mutation = useMutation({
    mutationFn: createEntity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all }),
  })

  const form = useForm({
    defaultValues: { name: '', email: '' },
    onSubmit: async ({ value }) => {
      mutation.reset()
      mutation.mutate(value)
    },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      {mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}

      <form.Field name="name" validators={{ onChange: ({ value }) => !value ? 'Required' : undefined }}>
        {(field) => (
          <div>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            {field.state.meta.errors.length > 0 && <p className="text-destructive text-sm">{field.state.meta.errors[0]}</p>}
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.canSubmit}>
        {(canSubmit) => (
          <Button disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
```

## Navigate After Submit

Use `mutateAsync` instead of `mutate`:

```tsx
onSubmit: async ({ value }) => {
  mutation.reset()
  await mutation.mutateAsync(value)
  navigate({ to: '/dashboard' })
}
```

## Validation

- Client: `validators.onChange` on `form.Field`
- Server: Zod in `createServerFn().validator()`
- Field errors inline below input
- Mutation errors at top of form via `<Alert variant="destructive">`
