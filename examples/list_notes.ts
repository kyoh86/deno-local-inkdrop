import { InkdropClient } from "../mod.ts";

const baseUrl = Deno.env.get("INKDROP_BASE_URL") ?? "http://127.0.0.1:19840";
const username = Deno.env.get("INKDROP_USERNAME");
const password = Deno.env.get("INKDROP_PASSWORD");

if (!username || !password) {
  console.error(
    "Set INKDROP_USERNAME and INKDROP_PASSWORD environment variables.",
  );
  Deno.exit(1);
}

const client = new InkdropClient({ baseUrl, username, password });

const notes = await client.notes.list({
  limit: 10,
  sort: "updatedAt",
  descending: true,
});
for (const note of notes) {
  console.log(`${note._id}\t${note.title ?? "(untitled)"}`);
}
