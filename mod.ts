import { encodeBase64 } from "@std/encoding/base64";
import { as, ensure, is } from "@core/unknownutil";
import type { Predicate } from "@core/unknownutil";

export type FetchLike = typeof fetch;

export interface InkdropClientOptions {
  baseUrl?: string;
  username: string;
  password: string;
  fetch?: FetchLike;
  headers?: HeadersInit;
}

export interface RequestOptions {
  params?: Params;
  headers?: HeadersInit;
  body?: unknown;
  signal?: AbortSignal;
}

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
  readonly notes: NotesAPI;
  readonly books: BooksAPI;
  readonly tags: TagsAPI;
  readonly files: FilesAPI;
  readonly docs: DocsAPI;

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

  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
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
          body: payload as T | null,
        },
      );
    }

    return payload as T;
  }

  get<T>(path: string, options?: Omit<RequestOptions, "body">): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  post<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, "body"> = {},
  ): Promise<T> {
    return this.request<T>("POST", path, { ...options, body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, "body">): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }
}

export type DocId = string;

export interface InkdropServerInfo {
  app: string;
  version: string;
  apiVersion: string;
}

export type NoteStatus = "none" | "active" | "onHold" | "completed" | "dropped";
export type NoteShare = "private" | "public";

export type ParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export type Params = Record<string, ParamValue>;

export interface NoteListParams extends Params {
  keyword?: string;
  limit?: number;
  skip?: number;
  sort?: "updatedAt" | "createdAt" | "title";
  descending?: boolean;
}

export interface BookListParams extends Params {
  limit?: number;
  skip?: number;
}

export interface TagListParams extends Params {
  limit?: number;
  skip?: number;
}

export interface FileListParams extends Params {
  limit?: number;
  skip?: number;
}

export interface DocGetParams extends Params {
  rev?: string;
  attachments?: boolean;
}

export interface MutationResponse {
  ok: boolean;
  id: string;
  rev: string;
}

export interface InkdropDocBase {
  _id: DocId;
  _rev: string;
  createdAt?: number;
  updatedAt?: number;
}

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

export type NoteInput = Partial<NoteDoc> & { doctype?: "markdown" };

export interface BookDoc extends InkdropDocBase {
  name: string;
  parentBookId?: DocId;
}

export type BookInput = Partial<BookDoc> & { name: string };

export interface TagDoc extends InkdropDocBase {
  name: string;
  color?: string;
  count?: number;
}

export type TagInput = Partial<TagDoc> & { name: string };

export interface AttachmentData {
  digest: string;
  content_type: string;
  revpos: number;
  data?: string | Record<string, unknown>;
}

export interface FileDoc extends InkdropDocBase {
  name: string;
  contentType?: string;
  contentLength?: number;
  md5digest?: string;
  revpos?: number;
  publicIn?: DocId[];
  _attachments?: Record<string, AttachmentData>;
}

export type FileInput = Partial<FileDoc> & { name: string };

export const isInkdropServerInfo: Predicate<InkdropServerInfo> = is.ObjectOf({
  app: is.String,
  version: is.String,
  apiVersion: is.String,
});

export const isMutationResponse: Predicate<MutationResponse> = is.ObjectOf({
  ok: is.Boolean,
  id: is.String,
  rev: is.String,
});

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

export const isBookDoc: Predicate<BookDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    name: is.String,
    parentBookId: as.Optional(is.String),
  }),
]);

export const isTagDoc: Predicate<TagDoc> = is.IntersectionOf([
  isInkdropDocBase,
  is.ObjectOf({
    name: is.String,
    color: as.Optional(is.String),
    count: as.Optional(is.Number),
  }),
]);

export const isAttachmentData: Predicate<AttachmentData> = is.ObjectOf({
  digest: is.String,
  content_type: is.String,
  revpos: is.Number,
  data: as.Optional(is.Jsonable),
});

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

export const isAnyDoc: Predicate<NoteDoc | BookDoc | TagDoc | FileDoc> = is
  .UnionOf([
    isNoteDoc,
    isBookDoc,
    isTagDoc,
    isFileDoc,
  ]);

export class NotesAPI {
  constructor(private readonly client: InkdropClient) {}

  list<T = NoteDoc>(params?: NoteListParams): Promise<T[]> {
    return this.client.get<unknown>("/notes", { params }).then((value) =>
      ensure(value, is.ArrayOf(isNoteDoc)) as T[]
    );
  }

  upsert<T = MutationResponse>(note: NoteInput): Promise<T> {
    return this.client.post<unknown>("/notes", note).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

export class BooksAPI {
  constructor(private readonly client: InkdropClient) {}

  list<T = BookDoc>(params?: BookListParams): Promise<T[]> {
    return this.client.get<unknown>("/books", { params }).then((value) =>
      ensure(value, is.ArrayOf(isBookDoc)) as T[]
    );
  }

  upsert<T = MutationResponse>(book: BookInput): Promise<T> {
    return this.client.post<unknown>("/books", book).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

export class TagsAPI {
  constructor(private readonly client: InkdropClient) {}

  list<T = TagDoc>(params?: TagListParams): Promise<T[]> {
    return this.client.get<unknown>("/tags", { params }).then((value) =>
      ensure(value, is.ArrayOf(isTagDoc)) as T[]
    );
  }

  upsert<T = MutationResponse>(tag: TagInput): Promise<T> {
    return this.client.post<unknown>("/tags", tag).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

export class FilesAPI {
  constructor(private readonly client: InkdropClient) {}

  list<T = FileDoc>(params?: FileListParams): Promise<T[]> {
    return this.client.get<unknown>("/files", { params }).then((value) =>
      ensure(value, is.ArrayOf(isFileDoc)) as T[]
    );
  }

  create<T = MutationResponse>(file: FileInput): Promise<T> {
    return this.client.post<unknown>("/files", file).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}

export class DocsAPI {
  constructor(private readonly client: InkdropClient) {}

  get<T = NoteDoc | BookDoc | TagDoc | FileDoc>(
    docId: DocId,
    params?: DocGetParams,
  ): Promise<T> {
    return this.client.get<unknown>(`/${docId}`, { params }).then((value) =>
      ensure(value, isAnyDoc) as T
    );
  }

  delete<T = MutationResponse>(docId: DocId): Promise<T> {
    return this.client.delete<unknown>(`/${docId}`).then((value) =>
      ensure(value, isMutationResponse) as T
    );
  }
}
