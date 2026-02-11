import { assertEquals, assertThrows } from "@std/assert";
import {
  basicAuthHeader,
  DocsAPI,
  InkdropClient,
  type NoteDoc,
  NotesAPI,
} from "./mod.ts";

Deno.test(function basicAuthHeaderTest() {
  assertEquals(
    basicAuthHeader("user", "pass"),
    "Basic dXNlcjpwYXNz",
  );
  assertThrows(
    async () => {
      const client = new InkdropClient({
        baseUrl: "",
        username: "",
        password: "",
      });
      const notesAPI = new NotesAPI(client);
      const notes = await notesAPI.list();

      const docs = new DocsAPI(client);
      const note: NoteDoc = await docs.get(notes[0]._id);
      console.log(note);
      return "";
    },
  );
});
