import { redirect } from "next/navigation";

/** For You rail lives on Discover — keep the bookmark/path working. */
export default function ForYouPage() {
  redirect("/discover");
}
