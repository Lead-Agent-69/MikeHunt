import { redirect } from "next/navigation";

/** Legacy /flash path → flash-deals (desk-redacted client page). */
export default function FlashPage() {
  redirect("/flash-deals");
}
