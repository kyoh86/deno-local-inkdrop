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
export interface RequestOptions<TParams extends Params = Params> {
  params?: TParams;
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

function buildUrl<TParams extends Params = Params>(
  baseUrl: string,
  path: string,
  params?: RequestOptions<TParams>["params"],
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
  async request<TParams extends Params = Params>(
    method: string,
    path: string,
    options: RequestOptions<TParams> = {},
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
  get<TParams extends Params = Params>(
    path: string,
    options?: Omit<RequestOptions<TParams>, "body">,
  ): Promise<unknown> {
    return this.request("GET", path, options);
  }

  /** POST helper. */
  post<TParams extends Params = Params>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions<TParams>, "body"> = {},
  ): Promise<unknown> {
    return this.request("POST", path, { ...options, body });
  }

  /** DELETE helper. */
  delete<TParams extends Params = Params>(
    path: string,
    options?: Omit<RequestOptions<TParams>, "body">,
  ): Promise<unknown> {
    return this.request("DELETE", path, options);
  }
}

/** Document ID type. */
export type DocId = NoteId | BookId | TagId | FileId;
export const isDocId: Predicate<DocId> = is.UnionOf([
  isNoteId,
  isBookId,
  isTagId,
  isFileId,
]);

/** Note ID type. */
export type NoteId = `note:${string}`;

/** Runtime validator for NoteId */
export function isNoteId(x: unknown): x is NoteId {
  return typeof x === "string" && x.startsWith("note:");
}

/** Notebook ID type. */
export type BookId = `book:${string}`;

/** Runtime validator for BookId */
export function isBookId(x: unknown): x is BookId {
  return typeof x === "string" && x.startsWith("book:");
}

/** Tag ID type. */
export type TagId = `tag:${string}`;

/** Runtime validator for TagId */
export function isTagId(x: unknown): x is TagId {
  return typeof x === "string" && x.startsWith("tag:");
}

/** File ID type. */
export type FileId = `file:${string}`;

/** Runtime validator for FileId */
export function isFileId(x: unknown): x is FileId {
  return typeof x === "string" && x.startsWith("file:");
}

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
export interface MutationResponse<TId extends string = DocId> {
  ok: boolean;
  id: TId;
  rev: string;
}

/** Common fields for Inkdrop docs. */
export interface InkdropDocBase {
  _rev: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Note document shape (markdown). */
export interface NoteDoc extends InkdropDocBase {
  _id: NoteId;
  doctype: "markdown";
  bookId: BookId;
  status: NoteStatus;
  share?: NoteShare;
  migratedBy?: string;
  numOfTasks?: number;
  numOfCheckedTasks?: number;
  pinned?: boolean;
  title?: string;
  body?: string;
  tags?: TagId[];
}

/** Note creation/update input. */
export type NoteInput = Partial<NoteDoc> & { doctype?: "markdown" };

/** Book document shape. */
export interface BookDoc extends InkdropDocBase {
  _id: BookId;
  name: string;
  parentBookId?: DocId;
}

/** Book creation/update input. */
export type BookInput = Partial<BookDoc> & { name: string };

/** Tag document shape. */
export interface TagDoc extends InkdropDocBase {
  _id: TagId;
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
  _id: FileId;
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
  id: isDocId,
  rev: is.String,
});

/** Runtime validator for MutationResponse<NoteId>. */
export const isNoteMutationResponse: Predicate<MutationResponse<NoteId>> = is
  .ObjectOf({
    ok: is.Boolean,
    id: isNoteId,
    rev: is.String,
  });

/** Runtime validator for MutationResponse<BookId>. */
export const isBookMutationResponse: Predicate<MutationResponse<BookId>> = is
  .ObjectOf({
    ok: is.Boolean,
    id: isBookId,
    rev: is.String,
  });

/** Runtime validator for MutationResponse<TagId>. */
export const isTagMutationResponse: Predicate<MutationResponse<TagId>> = is
  .ObjectOf({
    ok: is.Boolean,
    id: isTagId,
    rev: is.String,
  });

/** Runtime validator for MutationResponse<FileId>. */
export const isFileMutationResponse: Predicate<MutationResponse<FileId>> = is
  .ObjectOf({
    ok: is.Boolean,
    id: isFileId,
    rev: is.String,
  });

/** Runtime validator for InkdropDocBase. */
export const isInkdropDocBase: Predicate<InkdropDocBase> = is.ObjectOf({
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
    _id: isNoteId,
    doctype: is.LiteralOf("markdown"),
    bookId: isBookId,
    status: isNoteStatus,
    share: as.Optional(isNoteShare),
    migratedBy: as.Optional(is.String),
    numOfTasks: as.Optional(is.Number),
    numOfCheckedTasks: as.Optional(is.Number),
    pinned: as.Optional(is.Boolean),
    title: as.Optional(is.String),
    body: as.Optional(is.String),
    tags: as.Optional(is.ArrayOf(isTagId)),
  }),
]);

/** Runtime validator for BookDoc. */
export const isBookDoc: Predicate<BookDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    _id: isBookId,
    name: is.String,
    parentBookId: as.Optional(isBookId),
  }),
]);

/** Runtime validator for TagDoc. */
export const isTagDoc: Predicate<TagDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    _id: isTagId,
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
    _id: isFileId,
    name: is.String,
    contentType: as.Optional(is.String),
    contentLength: as.Optional(is.Number),
    md5digest: as.Optional(is.String),
    revpos: as.Optional(is.Number),
    publicIn: as.Optional(is.ArrayOf(isDocId)),
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
  async list(
    options?: RequestOptions<NoteListParams>,
  ): Promise<NoteDoc[]> {
    return await this.client.get("/notes", options).then((value) =>
      ensure(value, is.ArrayOf(isNoteDoc))
    );
  }

  /** Create or update a note. */
  async upsert(
    note: NoteInput,
    options?: RequestOptions,
  ): Promise<MutationResponse<NoteId>> {
    return await this.client.post("/notes", note, options).then((value) =>
      ensure(value, isNoteMutationResponse)
    );
  }
}

/** Books resource API. */
export class BooksAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List books with optional query params. */
  async list(
    options?: RequestOptions<BookListParams>,
  ): Promise<BookDoc[]> {
    return await this.client.get("/books", options).then((value) =>
      ensure(value, is.ArrayOf(isBookDoc))
    );
  }

  /** Create or update a book. */
  async upsert(
    book: BookInput,
    options?: RequestOptions,
  ): Promise<MutationResponse<BookId>> {
    return await this.client.post("/books", book, options).then((value) =>
      ensure(value, isBookMutationResponse)
    );
  }
}

/** Tags resource API. */
export class TagsAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List tags with optional query params. */
  async list(options?: RequestOptions<TagListParams>): Promise<TagDoc[]> {
    return await this.client.get("/tags", options).then((value) =>
      ensure(value, is.ArrayOf(isTagDoc))
    );
  }

  /** Create or update a tag. */
  async upsert(
    tag: TagInput,
    options?: RequestOptions,
  ): Promise<MutationResponse<TagId>> {
    return await this.client.post("/tags", tag, options).then((value) =>
      ensure(value, isTagMutationResponse)
    );
  }
}

/** Files resource API. */
export class FilesAPI {
  constructor(private readonly client: InkdropClient) {}

  /** List files with optional query params. */
  async list(options?: RequestOptions<FileListParams>): Promise<FileDoc[]> {
    return await this.client.get("/files", options).then((value) =>
      ensure(value, is.ArrayOf(isFileDoc))
    );
  }

  /** Create a file document. */
  async create(
    file: FileInput,
    options?: RequestOptions,
  ): Promise<MutationResponse<FileId>> {
    return await this.client.post("/files", file, options).then((value) =>
      ensure(value, isFileMutationResponse)
    );
  }
}

/** Doc-by-id resource API. */
export class DocsAPI {
  constructor(private readonly client: InkdropClient) {}

  async get(
    noteId: NoteId,
    options?: RequestOptions<DocGetParams>,
  ): Promise<NoteDoc>;

  async get(
    bookId: BookId,
    options?: RequestOptions<DocGetParams>,
  ): Promise<BookDoc>;

  async get(
    tagId: TagId,
    options?: RequestOptions<DocGetParams>,
  ): Promise<TagDoc>;

  async get(
    fileId: FileId,
    options?: RequestOptions<DocGetParams>,
  ): Promise<FileDoc>;

  /** Get a document by id. */
  async get(
    docId: DocId,
    options?: RequestOptions<DocGetParams>,
  ): Promise<NoteDoc | BookDoc | TagDoc | FileDoc> {
    return await this.client.get(`/${docId}`, options).then((value) =>
      ensure(value, isAnyDoc)
    );
  }

  async delete(
    noteId: NoteId,
    options?: RequestOptions,
  ): Promise<MutationResponse<NoteId>>;

  async delete(
    bookId: BookId,
    options?: RequestOptions,
  ): Promise<MutationResponse<BookId>>;

  async delete(
    tagId: TagId,
    options?: RequestOptions,
  ): Promise<MutationResponse<TagId>>;

  async delete(
    fileId: FileId,
    options?: RequestOptions,
  ): Promise<MutationResponse<FileId>>;

  /** Delete a document by id. */
  async delete(
    docId: DocId,
    options?: RequestOptions,
  ): Promise<MutationResponse> {
    return await this.client.delete(`/${docId}`, options).then((value) =>
      ensure(value, isMutationResponse)
    );
  }
}
