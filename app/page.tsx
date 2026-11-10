import { requireChatGPTUser } from "./chatgpt-auth";
import Workspace from "./workspace";
import { accessKey } from "@/lib/access";
import AccessGate from "@/components/access-gate";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (accessKey()) return <AccessGate />;
  await requireChatGPTUser("/");
  return <Workspace />;
}
