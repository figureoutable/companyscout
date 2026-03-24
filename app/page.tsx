import HomeClient from "@/components/HomeClient";

/** Allow long enrich runs on Vercel Pro (Hobby is still capped; use chunked client requests). */
export const maxDuration = 300;

/** Server Component root — do not add `"use client"` or `async` here. */
export default function Page() {
  return <HomeClient />;
}
