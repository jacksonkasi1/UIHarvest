# React & Next.js Best Practices

## Component Patterns
- Use functional components with hooks exclusively
- Prefer named exports over default exports
- Keep components focused — one responsibility per component
- Extract reusable logic into custom hooks (useXxx pattern)

## State Management
- Use useState for simple local state
- Use useReducer for complex state logic
- Lift state up only when necessary
- Consider context for deeply shared state, but prefer prop drilling for shallow trees

## Performance
- Memoize expensive computations with useMemo
- Memoize callback references with useCallback when passed as props
- Use React.memo for components that re-render with the same props
- Lazy load routes and heavy components with React.lazy + Suspense

## TypeScript
- Define prop interfaces for all components
- Use generics for reusable components
- Prefer strict mode (noImplicitAny, strictNullChecks)
- Use satisfies for type-checking without widening

## File Organization
```
src/
├── components/     # Reusable UI components
├── hooks/          # Custom hooks
├── views/          # Page-level components
├── lib/            # Utilities and helpers
├── types/          # Type definitions
├── config/         # Configuration
└── rest-api/       # API integration
```

## Routing (React Router v6+)
- Use createBrowserRouter for type-safe routing
- Use loader/action functions for data fetching
- Use Outlet for nested layouts

## Styling (Tailwind CSS)
- Use utility classes directly in JSX
- Create component variants with cva (class-variance-authority)
- Use cn() for conditional class merging
- Avoid @apply — compose utilities in components instead
