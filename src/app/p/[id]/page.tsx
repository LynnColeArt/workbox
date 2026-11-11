import { redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

// Code first: the project root hands visitors straight to the repo browser.
export default async function ProjectIndex({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  redirect(`/p/${id}/code`);
}
