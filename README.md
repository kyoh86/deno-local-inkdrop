# deno-local-inkdrop

Deno client for Inkdrop's Local HTTP Server.

## Status

Low-level request helper and basic resource APIs are implemented.

## Usage

```ts
import { InkdropClient } from "./mod.ts";

const client = new InkdropClient({
  baseUrl: "http://127.0.0.1:19840",
  username: "your-username",
  password: "your-password",
});

// Call any endpoint documented by Inkdrop Local HTTP Server.
// Example:
// const notes = await client.get("/notes", { params: { limit: 10 } });
```

## Authentication & Bind Address

- Inkdrop Local HTTP Server uses Basic auth with a username/password you set in
  Inkdrop.
- The server usually binds to `127.0.0.1`. Using `http://127.0.0.1:19840` is the
  most reliable default.
- If you change the bind address in Inkdrop, update `baseUrl` accordingly.

## Errors

On non-2xx responses, requests throw `InkdropError` with `status`, `statusText`,
and `body`.

## API

Low-level:

- `new InkdropClient({ baseUrl?, username, password, fetch?, headers? })`
- `client.request(method, path, { params?, headers?, body?, signal? })`
- `client.get(path, options)`
- `client.post(path, body?, options)`
- `client.delete(path, options)`
- `basicAuthHeader(username, password)`

High-level (resources):

- `client.notes.list({ keyword?, limit?, skip?, sort?, descending? })`
- `client.notes.upsert(note)`
- `client.books.list({ limit?, skip? })`
- `client.books.upsert(book)`
- `client.tags.list({ limit?, skip? })`
- `client.tags.upsert(tag)`
- `client.files.list({ limit?, skip? })`
- `client.files.create(file)`
- `client.docs.get(docId, { rev?, attachments? })`
- `client.docs.delete(docId)`

Types:

- `NoteDoc`, `BookDoc`, `TagDoc`, `FileDoc`
- `NoteInput`, `BookInput`, `TagInput`, `FileInput`

## Development

```sh
deno task test
```

## Examples

See `examples/list_notes.ts` for a real request against a local Inkdrop server.

```sh
INKDROP_USERNAME=... INKDROP_PASSWORD=... \
  deno run --allow-net --allow-env examples/list_notes.ts
```

## License

MIT
