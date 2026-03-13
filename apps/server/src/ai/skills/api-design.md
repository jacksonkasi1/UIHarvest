# API Design Patterns

## REST API Design
- Use resource-based URLs: /api/users, /api/users/:id
- HTTP methods: GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)
- Use plural nouns for collections
- Nest sub-resources: /api/users/:id/posts

## Request/Response
- Always return JSON
- Use consistent response envelopes: { data, error, meta }
- Include pagination metadata: { page, limit, total, hasMore }
- Return appropriate HTTP status codes

## Error Handling
- 400: Bad Request (validation errors)
- 401: Unauthorized (no auth)
- 403: Forbidden (no permission)
- 404: Not Found
- 409: Conflict (duplicate)
- 422: Unprocessable Entity (semantic errors)
- 500: Internal Server Error

## TypeScript API Client Pattern
```typescript
// Centralized axios instance
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// Domain-specific API functions
export const getUsers = async (): Promise<User[]> => {
  const { data } = await api.get('/users')
  return data
}

export const createUser = async (input: CreateUserInput): Promise<User> => {
  const { data } = await api.post('/users', input)
  return data
}
```

## Validation
- Validate all inputs with Zod schemas
- Return structured validation errors
- Validate on both client and server

## Authentication
- Use httpOnly cookies for session tokens
- Support Bearer token as fallback
- Implement CSRF protection for cookie-based auth
