import { Suspense } from "react";
import { MembersPage } from "@/features/members/members-page";
import { Skeleton } from "@/components/ui/misc";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MembersPage />
    </Suspense>
  );
}
