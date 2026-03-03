---
paths:
  - "apps/user-application/src/components/**"
  - "apps/user-application/src/routes/**"
---

# Form Patterns

## Required Stack

Always use `useForm` (TanStack Form) + `useMutation` (TanStack Query). Never raw `useState` for form state.

## Standard Form Template

```tsx
function CreateEntityForm() {
  const mutation = useMutation({
    mutationFn: createEntity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: entityKeys.all }),
  });

  const form = useForm({
    defaultValues: { name: '', email: '' },
    onSubmit: async ({ value }) => {
      mutation.reset();
      mutation.mutate(value);
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      {mutation.isError && <Alert variant="destructive">{mutation.error.message}</Alert>}

      <form.Field name="name" validators={{
        onChange: ({ value }) => !value ? 'Required' : undefined,
      }}>
        {(field) => (
          <div>
            <Input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
            {field.state.meta.errors.length > 0 && <p>{field.state.meta.errors[0]}</p>}
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
  );
}
```

## Navigation After Submit

Use `mutateAsync` when you need to navigate:

```tsx
onSubmit: async ({ value }) => {
  mutation.reset();
  await mutation.mutateAsync(value);
  navigate({ to: '/dashboard' });
}
```

## Validation

- Client: `validators.onChange` on `form.Field`
- Server: Zod schema in `createServerFn().validator()`
- Show field errors inline, mutation errors at form top
