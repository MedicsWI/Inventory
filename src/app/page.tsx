// Root redirects: middleware handles auth, so an unauthenticated user
// hitting "/" will be sent to /login automatically.
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}
