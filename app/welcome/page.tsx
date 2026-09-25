import { redirect } from "next/navigation";

// Cars-only app: the old vertical selector now just forwards straight into the deal feed.
export default function WelcomePage() {
  redirect("/discover");
}
