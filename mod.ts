import { encodeBase64 } from "@std/encoding/base64";
import { as, ensure, is } from "@core/unknownutil";
import type { Jsonable, Predicate } from "@core/unknownutil";
export type { Jsonable, Predicate };

/** Fetch function signature used by the client. */
export type FetchLike = typeof fetch;

/** Client construction options. */
export interface InkdropClientOptions {
  baseUrl?: string;
  username: string;
  password: string;
  fetch?: FetchLike;
  headers?: HeadersInit;
}

/** Low-level request options. */
export interface RequestOptions {
  params?: Params;
  headers?: HeadersInit;
  body?: unknown;
  signal?: AbortSignal;
}

/** Error thrown for non-2xx responses. */
export class InkdropError<T = unknown> extends Error {
  status: number;
  statusText: string;
  body?: T;

  constructor(
    message: string,
    opts: { status: number; statusText: string; body?: T },
  ) {
    super(message);
    this.name = "InkdropError";
    this.status = opts.status;
    this.statusText = opts.statusText;
    this.body = opts.body;
  }
}

/** Build a Basic Authorization header value. */
export function basicAuthHeader(username: string, password: string): string {
  const encoded = encodeBase64(
    new TextEncoder().encode(`${username}:${password}`),
  );
  return `Basic ${encoded}`;
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: RequestOptions["params"],
): URL {
  const url = new URL(path, baseUrl);
  if (!params) return url;

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

function isBodyInitLike(body: unknown): body is BodyInit {
  return (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof Uint8Array ||
    body instanceof ReadableStream ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  );
}

export class InkdropClient {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  private readonly fetcher: FetchLike;
  private readonly defaultHeaders: Headers;
  /** Notes resource helper. */
  readonly notes: NotesAPI;
  /** Books resource helper. */
  readonly books: BooksAPI;
  /** Tags resource helper. */
  readonly tags: TagsAPI;
  /** Files resource helper. */
  readonly files: FilesAPI;
  /** Doc-by-id helper. */
  readonly docs: DocsAPI;

  /** Create a client for Inkdrop Local HTTP Server. */
  constructor(options: InkdropClientOptions) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:19840";
    this.username = options.username;
    this.password = options.password;
    this.fetcher = options.fetch ?? fetch;
    this.defaultHeaders = new Headers(options.headers ?? {});
    if (!this.defaultHeaders.has("Authorization")) {
      this.defaultHeaders.set(
        "Authorization",
        basicAuthHeader(this.username, this.password),
      );
    }
    if (!this.defaultHeaders.has("Accept")) {
      this.defaultHeaders.set("Accept", "application/json");
    }
    this.notes = new NotesAPI(this);
    this.books = new BooksAPI(this);
    this.tags = new TagsAPI(this);
    this.files = new FilesAPI(this);
    this.docs = new DocsAPI(this);
  }

  /** Perform a low-level HTTP request. */
  async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const url = buildUrl(this.baseUrl, path, options.params);
    const headers = new Headers(this.defaultHeaders);
    if (options.headers) {
      for (const [key, value] of new Headers(options.headers).entries()) {
        headers.set(key, value);
      }
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (isBodyInitLike(options.body)) {
        body = options.body;
      } else {
        body = JSON.stringify(options.body);
        if (!headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
      }
    }

    const response = await this.fetcher(url.toString(), {
      method,
      headers,
      body,
      signal: options.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const hasJson = contentType.includes("application/json");
    const payload = response.status === 204
      ? null
      : (hasJson ? await response.json() : await response.text());

    if (!response.ok) {
      throw new InkdropError(
        `Inkdrop API error: ${response.status} ${response.statusText}`,
        {
          status: response.status,
          statusText: response.statusText,
          body: payload as unknown,
        },
      );
    }

    return payload as unknown;
  }

  /** GET helper. */
  get(
    path: string,
    options?: Omit<RequestOptions, "body">,
  ): Promise<unknown> {
    return this.request("GET", path, options);
  }

  /** POST helper. */
  post(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, "body"> = {},
  ): Promise<unknown> {
    return this.request("POST", path, { ...options, body });
  }

  /** DELETE helper. */
  delete(
    path: string,
    options?: Omit<RequestOptions, "body">,
  ): Promise<unknown> {
    return this.request("DELETE", path, options);
  }
}

/** Document ID type. */
export type DocId = string;

/** Info returned by the root endpoint. */
export interface InkdropServerInfo {
  app: string;
  version: string;
  apiVersion: string;
}

/** Note status values. */
export type NoteStatus = "none" | "active" | "onHold" | "completed" | "dropped";
/** Note share visibility. */
export type NoteShare = "private" | "public";

/** Query parameter value types. */
export type ParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

/** Query parameter map. */
export type Params = Record<string, ParamValue>;

/** Query parameters for listing notes. */
export interface NoteListParams extends Params {
  keyword?: string;
  limit?: number;
  skip?: number;
  sort?: "updatedAt" | "createdAt" | "title";
  descending?: boolean;
}

/** Query parameters for listing books. */
export interface BookListParams extends Params {
  limit?: number;
  skip?: number;
}

/** Query parameters for listing tags. */
export interface TagListParams extends Params {
  limit?: number;
  skip?: number;
}

/** Query parameters for listing files. */
export interface FileListParams extends Params {
  limit?: number;
  skip?: number;
}

/** Query parameters for fetching a doc by id. */
export interface DocGetParams extends Params {
  rev?: string;
  attachments?: boolean;
}

/** Mutation response from create/update/delete. */
export interface MutationResponse {
  ok: boolean;
  id: string;
  rev: string;
}

/** Common fields for Inkdrop docs. */
export interface InkdropDocBase {
  _id: DocId;
  _rev: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Note document shape (markdown). */
export interface NoteDoc extends InkdropDocBase {
  doctype: "markdown";
  bookId: DocId;
  status: NoteStatus;
  share?: NoteShare;
  migratedBy?: string;
  numOfTasks?: number;
  numOfCheckedTasks?: number;
  pinned?: boolean;
  title?: string;
  body?: string;
  tags?: DocId[];
}

/** Note creation/update input. */
export type NoteInput = Partial<NoteDoc> & { doctype?: "markdown" };

/** Book document shape. */
export interface BookDoc extends InkdropDocBase {
  name: string;
  parentBookId?: DocId;
}

/** Book creation/update input. */
export type BookInput = Partial<BookDoc> & { name: string };

/** Tag document shape. */
export interface TagDoc extends InkdropDocBase {
  name: string;
  color?: string;
  count?: number;
}

/** Tag creation/update input. */
export type TagInput = Partial<TagDoc> & { name: string };

/** Attachment metadata for file documents. */
export interface AttachmentData {
  digest: string;
  content_type: string;
  revpos: number;
  data?: Jsonable;
}

/** File document shape. */
export interface FileDoc extends InkdropDocBase {
  name: string;
  contentType?: string;
  contentLength?: number;
  md5digest?: string;
  revpos?: number;
  publicIn?: DocId[];
  _attachments?: Record<string, AttachmentData>;
}

/** File creation input. */
export type FileInput = Partial<FileDoc> & { name: string };

/** Runtime validator for InkdropServerInfo. */
export const isInkdropServerInfo: Predicate<InkdropServerInfo> = is.ObjectOf({
  app: is.String,
  version: is.String,
  apiVersion: is.String,
});

/** Runtime validator for MutationResponse. */
export const isMutationResponse: Predicate<MutationResponse> = is.ObjectOf({
  ok: is.Boolean,
  id: is.String,
  rev: is.String,
});

/** Runtime validator for InkdropDocBase. */
export const isInkdropDocBase: Predicate<InkdropDocBase> = is.ObjectOf({
  _id: is.String,
  _rev: is.String,
  createdAt: as.Optional(is.Number),
  updatedAt: as.Optional(is.Number),
});

const isNoteStatus: Predicate<NoteDoc["status"]> = is.UnionOf([
  is.LiteralOf("none"),
  is.LiteralOf("active"),
  is.LiteralOf("onHold"),
  is.LiteralOf("completed"),
  is.LiteralOf("dropped"),
]);

const isNoteShare: Predicate<NoteShare> = is.UnionOf([
  is.LiteralOf("private"),
  is.LiteralOf("public"),
]);

/** Runtime validator for NoteDoc. */
export const isNoteDoc: Predicate<NoteDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    doctype: is.LiteralOf("markdown"),
    bookId: is.String,
    status: isNoteStatus,
    share: as.Optional(isNoteShare),
    migratedBy: as.Optional(is.String),
    numOfTasks: as.Optional(is.Number),
    numOfCheckedTasks: as.Optional(is.Number),
    pinned: as.Optional(is.Boolean),
    title: as.Optional(is.String),
    body: as.Optional(is.String),
    tags: as.Optional(is.ArrayOf(is.String)),
  }),
]);

/** Runtime validator for BookDoc. */
export const isBookDoc: Predicate<BookDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    name: is.String,
    parentBookId: as.Optional(is.String),
  }),
]);

/** Runtime validator for TagDoc. */
export const isTagDoc: Predicate<TagDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    name: is.String,
    color: as.Optional(is.String),
    count: as.Optional(is.Number),
  }),
]);

/** Runtime validator for AttachmentData. */
export const isAttachmentData: Predicate<AttachmentData> = is.ObjectOf({
  digest: is.String,
  content_type: is.String,
  revpos: is.Number,
  data: as.Optional(is.Jsonable),
});

/** Runtime validator for FileDoc. */
export const isFileDoc: Predicate<FileDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    name: is.String,
    contentType: as.Optional(is.String),
    contentLength: as.Optional(is.Number),
    md5digest: as.Optional(is.String),
    revpos: as.Optional(is.Number),
    publicIn: as.Optional(is.ArrayOf(is.String)),
    _attachments: as.Optional(is.RecordOf(isAttachmentData, is.String)),
  }),
]);

/** Runtime validator for any supported doc type. */
export const isAnyDoc: Predicate<NoteDoc | BookDoc | TagDoc | FileDoc> = is
  .UnionOf([
    isNoteDoc,
    isBookDoc,
    isTagDoc,
    isFileDoc,
  ]);

/** Notes resource API. */
export class NotesAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List notes with optional query params. */
  list<T = NoteDoc>(params?: NoteListParams): Promise<T[]> {
    return this.client.get("/notes", { params }).then((value) =>
      ensure(value, is.ArrayOf(isNoteDoc)) as T[]
    );
  }

  /** Create or update a note. */
  upsert<T = MutationResponse>(note: NoteInput): Promise<T> {
    return this.client.post("/notes", note).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

/** Books resource API. */
export class BooksAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List books with optional query params. */
  list<T = BookDoc>(params?: BookListParams): Promise<T[]> {
    return this.client.get("/books", { params }).then((value) =>
      ensure(value, is.ArrayOf(isBookDoc)) as T[]
    );
  }

  /** Create or update a book. */
  upsert<T = MutationResponse>(book: BookInput): Promise<T> {
    return this.client.post("/books", book).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

/** Tags resource API. */
export class TagsAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List tags with optional query params. */
  list<T = TagDoc>(params?: TagListParams): Promise<T[]> {
    return this.client.get("/tags", { params }).then((value) =>
      ensure(value, is.ArrayOf(isTagDoc)) as T[]
    );
  }

  /** Create or update a tag. */
  upsert<T = MutationResponse>(tag: TagInput): Promise<T> {
    return this.client.post("/tags", tag).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

/** Files resource API. */
export class FilesAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List files with optional query params. */
  list<T = FileDoc>(params?: FileListParams): Promise<T[]> {
    return this.client.get("/files", { params }).then((value) =>
      ensure(value, is.ArrayOf(isFileDoc)) as T[]
    );
  }

  /** Create a file document. */
  create<T = MutationResponse>(file: FileInput): Promise<T> {
    return this.client.post("/files", file).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

/** Doc-by-id resource API. */
export class DocsAPI {
  constructor(private readonly client: InkdropClient) {}

  /** Get a document by id. */
  get<T = NoteDoc | BookDoc | TagDoc | FileDoc>(
    docId: DocId,
    params?: DocGetParams,
  ): Promise<T> {
    return this.client.get(`/${docId}`, { params }).then((value) =>
      ensure(value, isAnyDoc) as T
    );
  }

  /** Delete a document by id. */
  delete<T = MutationResponse>(docId: DocId): Promise<T> {
    return this.client.delete(`/${docId}`).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}
