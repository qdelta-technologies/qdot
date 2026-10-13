import "server-only";
import { executeTool } from "./composio";

// Posting to Instagram through Composio's Instagram tools: a photo, a Reel (video), or a carousel of 2 to 10 photos.
// Make a media container from public links to the files, wait until Instagram has processed it, then publish it.
// Needs an Instagram Business or Creator account.

export type InstagramResult = { ok: boolean; link: string | null; message: string };
type Run = (slug: string, args: Record<string, unknown>) => Promise<string>;

const IMAGE_TYPES = /^image\/(jpeg|png)$/i;
const VIDEO_TYPES = /^video\/(mp4|quicktime)$/i;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;
const MAX_CAPTION = 2200;

const failed = (out: string) => /"successful"\s*:\s*false|^Error:/i.test(out.trim().slice(0, 300));
const idIn = (out: string) => out.match(/"id"\s*:\s*"?(\d{8,})"?/)?.[1] ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const brief = (out: string) => out.replace(/\s+/g, " ").slice(0, 300);
const no = (message: string): InstagramResult => ({ ok: false, link: null, message });

/** Wait until Instagram has processed a container. Returns null when it is ready, or the reason it is not. */
async function waitUntilReady(run: Run, creationId: string, totalMs: number, stepMs: number): Promise<string | null> {
  const deadline = Date.now() + totalMs;
  let last = "";
  while (Date.now() < deadline) {
    await sleep(stepMs);
    last = await run("INSTAGRAM_GET_POST_STATUS", { creation_id: creationId });
    // Composio replies always carry an "error": null field, so only the status value itself decides
    if (/"status_code"\s*:\s*"?(FINISHED|PUBLISHED)/i.test(last) || /\bFinished: Media is ready/i.test(last) || (/\bFINISHED\b/.test(last) && !/"status_code"\s*:\s*"?(ERROR|EXPIRED|IN_PROGRESS)/i.test(last))) return null;
    if (/"status_code"\s*:\s*"?(ERROR|EXPIRED)/i.test(last)) return `Instagram could not process the file: ${brief(last)}`;
  }
  return `Instagram is still processing the file, so it was NOT published. Try again in a few minutes. Last status: ${brief(last)}`;
}

/** The numeric id of the connected Instagram account, or null when it can't be read. */
async function accountId(run: Run): Promise<string | null> {
  try {
    return idIn(await run("INSTAGRAM_GET_USER_INFO", {}));
  } catch {
    return null;
  }
}

/** Publish a finished container and read back the post's link. */
async function publish(run: Run, creationId: string, igUserId: string): Promise<InstagramResult> {
  const published = await run("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", { ig_user_id: igUserId, creation_id: creationId });
  const mediaId = failed(published) ? null : idIn(published);
  if (!mediaId) return no(`Instagram did not confirm the post, so assume it was NOT published. Details: ${brief(published)}`);

  let link: string | null = null;
  try {
    const info = await run("INSTAGRAM_GET_IG_MEDIA", { ig_media_id: mediaId, fields: "permalink" });
    link = info.match(/https:\/\/www\.instagram\.com\/[^"\s\\]+/)?.[0] ?? null;
  } catch {
    // the link is a nice-to-have
  }
  return { ok: true, link, message: link ? `Published on Instagram: ${link}` : "Published on Instagram. The direct link could not be read back, so open your profile to see it." };
}

export async function postInstagram(url: string, caption: string, kind: "photo" | "reel", mime: string, size: number, account?: string | null): Promise<InstagramResult> {
  const run: Run = (slug, args) => executeTool(slug, args, account);
  if (kind === "photo" && !IMAGE_TYPES.test(mime)) return no(`Instagram photos must be JPG or PNG, and this file is ${mime || "unknown"}. WebP is not accepted.`);
  if (kind === "reel" && !VIDEO_TYPES.test(mime)) return no(`Instagram videos must be MP4 or MOV, and this file is ${mime || "unknown"}.`);
  if (kind === "photo" && size > MAX_IMAGE) return no(`That photo is ${(size / 1048576).toFixed(1)} MB. Instagram's limit is 8 MB.`);
  if (kind === "reel" && size > MAX_VIDEO) return no(`That video is ${(size / 1048576).toFixed(0)} MB. The limit here is 100 MB.`);
  if (caption.length > MAX_CAPTION) return no("The caption is longer than Instagram's 2,200 character limit.");

  const created = await run("INSTAGRAM_CREATE_MEDIA_CONTAINER", {
    content_type: kind,
    caption,
    ...(kind === "photo" ? { image_url: url } : { video_url: url, share_to_feed: true }),
  });
  const creationId = failed(created) ? null : idIn(created);
  if (!creationId) return no(`Instagram would not accept the file. Check that the account is a Business or Creator account. Details: ${brief(created)}`);

  // Instagram fetches and processes the file; a Reel takes a while.
  const problem = await waitUntilReady(run, creationId, kind === "reel" ? 4 * 60_000 : 60_000, kind === "reel" ? 6000 : 3000);
  if (problem) return no(problem);

  return publish(run, creationId, (await accountId(run)) ?? "me");
}

/** A carousel: 2 to 10 photos shown as one post, swiped left to right in the order given. */
export async function postInstagramCarousel(items: { url: string; mime: string; size: number }[], caption: string, account?: string | null): Promise<InstagramResult> {
  const run: Run = (slug, args) => executeTool(slug, args, account);
  if (items.length < 2 || items.length > 10) return no(`A carousel needs 2 to 10 photos, and ${items.length} were given.`);
  for (const [i, it] of items.entries()) {
    if (!IMAGE_TYPES.test(it.mime)) return no(`Photo ${i + 1} is ${it.mime || "an unknown type"}. Carousel photos must be JPG or PNG. WebP and video are not accepted here.`);
    if (it.size > MAX_IMAGE) return no(`Photo ${i + 1} is ${(it.size / 1048576).toFixed(1)} MB. Instagram's limit is 8 MB per photo.`);
  }
  if (caption.length > MAX_CAPTION) return no("The caption is longer than Instagram's 2,200 character limit.");

  // This Composio step needs the account's numeric id; "me" is not accepted.
  const igUserId = await accountId(run);
  if (!igUserId) return no("Could not read the Instagram account id, so nothing was posted. Check that the account is connected and is a Business or Creator account.");

  const created = await run("INSTAGRAM_CREATE_CAROUSEL_CONTAINER", { ig_user_id: igUserId, caption, child_image_urls: items.map((it) => it.url) });
  const creationId = failed(created) ? null : idIn(created);
  if (!creationId) return no(`Instagram would not accept the photos. Check that the account is a Business or Creator account. Details: ${brief(created)}`);

  const problem = await waitUntilReady(run, creationId, 2 * 60_000, 4000);
  if (problem) return no(problem);

  return publish(run, creationId, igUserId);
}
