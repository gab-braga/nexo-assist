import { protectPage } from "@/auth/guards";
import { ProfileDetails } from "@/components/profile-details";
export default async function ProfilePage() {
  const user = await protectPage("chat");
  return <ProfileDetails user={user} />;
}
