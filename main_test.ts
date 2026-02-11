import { assertEquals } from "@std/assert";
import { basicAuthHeader } from "./mod.ts";

Deno.test(function basicAuthHeaderTest() {
  assertEquals(
    basicAuthHeader("user", "pass"),
    "Basic dXNlcjpwYXNz",
  );
});
